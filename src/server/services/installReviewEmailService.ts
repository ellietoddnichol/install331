import { GoogleGenAI, Type } from '@google/genai';
import { EstimateSummary, InstallReviewEmailDraft, ProjectRecord, TakeoffLineRecord } from '../../shared/types/estimator.ts';
import { buildProposalLineItems } from '../../shared/utils/proposalDocument.ts';
import { buildProjectConditionSummaryLines, getProjectConditions } from '../../shared/utils/jobConditions.ts';
import { formatCurrencySafe, formatNumberSafe } from '../../utils/numberFormat.ts';

interface InstallReviewInsights {
	considerations: string[];
	reviewQuestions: string[];
}

interface InstallReviewEmailInput {
	project: ProjectRecord;
	lines: TakeoffLineRecord[];
	summary: EstimateSummary;
}

function asText(value: unknown): string {
	return String(value ?? '').trim();
}

function summarizeLocation(project: ProjectRecord): string {
	return asText(project.address) || 'Location TBD';
}

function buildScopeLines(lines: TakeoffLineRecord[]): string[] {
	const grouped = buildProposalLineItems(lines);
	const visible = grouped.slice(0, 20).map((line) => {
		const quantity = Number.isInteger(line.quantity) ? String(line.quantity) : formatNumberSafe(line.quantity, 2);
		return `${line.description}: ${quantity} ${line.unit}`;
	});

	if (grouped.length > 20) {
		visible.push(`Additional grouped items: ${grouped.length - 20}`);
	}

	return visible;
}

function hasLineMatch(lines: TakeoffLineRecord[], pattern: RegExp): boolean {
	return lines.some((line) => pattern.test(`${line.description} ${line.category || ''} ${line.notes || ''}`));
}

function buildFallbackInsights(input: InstallReviewEmailInput): InstallReviewInsights {
	const considerations = new Set<string>();
	const questions = new Set<string>();
	const jobConditions = input.project.jobConditions;
	const projectConditions = getProjectConditions(jobConditions);

	if (hasLineMatch(input.lines, /(grab bar|shower seat|mirror|ada)/i)) {
		considerations.add('Verify ADA mounting heights, clearances, and backing requirements with field conditions.');
	}

	if (hasLineMatch(input.lines, /(hand dryer|soap dispenser|automatic|sensor|paper towel dispenser)/i)) {
		considerations.add('Verify power rough-in, device locations, and trade coordination before install.');
	}

	if (hasLineMatch(input.lines, /(recess|recess kit|recessed)/i)) {
		considerations.add('Verify wall depth, blocking, and recess framing before release.');
	}

	if (projectConditions.nightWork) {
		considerations.add('Confirm night access windows, staging limits, cleanup requirements, and turnover expectations.');
	}

	if (jobConditions.occupiedBuilding || jobConditions.restrictedAccess) {
		considerations.add('Confirm access restrictions, protection requirements, and sequencing around occupied areas.');
	}

	if (jobConditions.phasedWork) {
		considerations.add(`Confirm phased install sequencing across ${jobConditions.phasedWorkPhases} phases and verify remobilization assumptions.`);
	}

	if (jobConditions.remoteTravel || (jobConditions.travelDistanceMiles ?? 0) > 50) {
		considerations.add('Verify travel, parking, unloading, and material staging assumptions for the site.');
	}

	considerations.add('Verify final field measurements, substrate conditions, and anchor suitability before install.');

	questions.add('Does crew size look right?');
	questions.add('Does the timeline feel realistic?');
	questions.add('Any missing scope?');
	questions.add('Any material or install risks?');
	questions.add('Any concerns with night work or access conditions?');

	return {
		considerations: Array.from(considerations).slice(0, 6),
		reviewQuestions: Array.from(questions),
	};
}

function normalizeGeminiList(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value
		.map((entry) => asText(entry))
		.filter(Boolean)
		.map((entry) => entry.replace(/^[-*•]\s*/, '').trim())
		.filter(Boolean);
}

function ensureRequiredQuestions(questions: string[]): string[] {
	const required = [
		'Does crew size look right?',
		'Does the timeline feel realistic?',
		'Any missing scope?',
		'Any material or install risks?',
		'Any concerns with night work or access conditions?',
	];
	const output = [...questions];

	required.forEach((requiredQuestion) => {
		const present = output.some((question) => question.toLowerCase().includes(requiredQuestion.toLowerCase().replace(/[?]/g, '')));
		if (!present) output.push(requiredQuestion);
	});

	return output.slice(0, 7);
}

async function generateGeminiInsights(input: InstallReviewEmailInput): Promise<InstallReviewInsights | null> {
	const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || '';
	if (!apiKey) return null;

	const ai = new GoogleGenAI({ apiKey });
	const prompt = [
		'You are helping an install estimator prepare an internal install review email.',
		'Write concise internal operations bullets only.',
		'Do not use sales language.',
		'Do not restate pricing totals or scope lines in paragraph form.',
		'Do not invent missing project details.',
		'If uncertain, say verify with field conditions.',
		'Do not mention union wage as an adder or modifier.',
		'',
		`Project: ${input.project.projectName}`,
		`Location: ${summarizeLocation(input.project)}`,
		`Bid Due Date: ${input.project.bidDate || input.project.proposalDate || input.project.dueDate || 'Not provided'}`,
		`Crew Size: ${input.project.jobConditions.installerCount}`,
		`Estimated Install Hours: ${formatNumberSafe(input.summary.totalLaborHours || 0, 1)}`,
		`Estimated Days On Site: ${formatNumberSafe(input.summary.durationDays || 0, 1)}`,
		`Material Total: ${formatCurrencySafe(input.summary.materialSubtotal || 0)}`,
		`Labor Total: ${formatCurrencySafe(input.summary.adjustedLaborSubtotal || input.summary.laborSubtotal || 0)}`,
		`Proposal Total: ${formatCurrencySafe(input.summary.baseBidTotal || 0)}`,
		`Project Conditions: ${JSON.stringify(buildProjectConditionSummaryLines(input.project.jobConditions))}`,
		`Scope Summary: ${JSON.stringify(buildScopeLines(input.lines))}`,
		`Special Notes: ${JSON.stringify([asText(input.project.specialNotes), asText(input.project.notes)].filter(Boolean))}`,
		'',
		'Return JSON only with:',
		'- considerations: 4 to 6 concise install-risk bullets',
		'- reviewQuestions: 5 concise install-review questions that cover crew size, timeline, missing scope, risks, and night work/access when relevant',
	].join('\n');

	const response = await ai.models.generateContent({
		model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
		contents: [{ role: 'user', parts: [{ text: prompt }] }],
		config: {
			responseMimeType: 'application/json',
			responseSchema: {
				type: Type.OBJECT,
				properties: {
					considerations: {
						type: Type.ARRAY,
						items: { type: Type.STRING },
					},
					reviewQuestions: {
						type: Type.ARRAY,
						items: { type: Type.STRING },
					},
				},
			},
		},
	});

	try {
		const parsed = JSON.parse(response.text || '{}');
		const considerations = normalizeGeminiList(parsed.considerations).slice(0, 6);
		const reviewQuestions = ensureRequiredQuestions(normalizeGeminiList(parsed.reviewQuestions));
		if (!considerations.length && !reviewQuestions.length) return null;
		return {
			considerations,
			reviewQuestions,
		};
	} catch {
		return null;
	}
}

function buildSection(title: string, lines: string[]): string {
	const content = lines.length ? lines.map((line) => `- ${line}`).join('\n') : '- None noted';
	return `${title}\n${content}`;
}

export async function generateInstallReviewEmailDraft(input: InstallReviewEmailInput): Promise<InstallReviewEmailDraft> {
	const location = summarizeLocation(input.project);
	const crewSize = Number(input.project.jobConditions.installerCount || 0) || null;
	const conditionLines = buildProjectConditionSummaryLines(input.project.jobConditions);
	const scopeLines = buildScopeLines(input.lines);
	const insights = (await generateGeminiInsights(input)) || buildFallbackInsights(input);
	const pricingLines = [
		`Material Cost: ${formatCurrencySafe(input.summary.materialSubtotal || 0)}`,
		`Labor Cost: ${formatCurrencySafe(input.summary.adjustedLaborSubtotal || input.summary.laborSubtotal || 0)}`,
		`Total Estimated Price: ${formatCurrencySafe(input.summary.baseBidTotal || 0)}`,
	];
	const laborScheduleLines = [
		`Total estimated install hours: ${formatNumberSafe(input.summary.totalLaborHours || 0, 1)}`,
		`Estimated days on site: ${formatNumberSafe(input.summary.durationDays || 0, 1)}`,
		`Suggested crew size: ${crewSize ?? 'TBD'}`,
		`Timing assumptions: ${input.project.bidDate || input.project.proposalDate || input.project.dueDate || 'Verify schedule window with field conditions.'}`,
	];
	const projectOverviewLines = [
		`Project Name: ${input.project.projectName}`,
		`Location: ${location}`,
		`Expected Project Timing / Start Date: ${input.project.bidDate || input.project.proposalDate || input.project.dueDate || 'Not provided'}`,
		`Estimated Install Duration: ${formatNumberSafe(input.summary.durationDays || 0, 1)} day${Number(input.summary.durationDays || 0) === 1 ? '' : 's'}`,
		`Suggested Crew Size: ${crewSize ?? 'TBD'}`,
	];
	const projectModifierLines = [
		...conditionLines,
		...[asText(input.project.specialNotes), asText(input.project.notes)].filter(Boolean),
	];
	const subject = `Install Review - ${input.project.projectName} - ${location}`;
	const body = [
		buildSection('Project Overview', projectOverviewLines),
		buildSection('Scope Summary', scopeLines),
		buildSection('Pricing Summary', pricingLines),
		buildSection('Labor / Schedule Summary', laborScheduleLines),
		buildSection('Project Modifiers / Conditions', projectModifierLines),
		buildSection('Key Install Considerations', insights.considerations),
		buildSection('Questions for Install Review', ensureRequiredQuestions(insights.reviewQuestions)),
	].join('\n\n');

	return {
		subject,
		body,
		summary: {
			projectName: input.project.projectName,
			location,
			crewSize,
			estimatedHours: Number(input.summary.totalLaborHours || 0),
			estimatedDays: Number(input.summary.durationDays || 0),
			materialTotal: Number(input.summary.materialSubtotal || 0),
			laborTotal: Number(input.summary.adjustedLaborSubtotal || input.summary.laborSubtotal || 0),
			proposalTotal: Number(input.summary.baseBidTotal || 0),
			projectConditions: projectModifierLines,
		},
	};
}
