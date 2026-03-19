export type ProjectDateField = 'bidDate' | 'proposalDate' | 'dueDate';

export interface ProjectDateValidationError {
  field: ProjectDateField;
  message: string;
}

const FIELD_LABELS: Record<ProjectDateField, string> = {
  bidDate: 'Bid date',
  proposalDate: 'Proposal date',
  dueDate: 'Due date',
};

function parseLocalDate(value: string | null | undefined): Date | null {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(year, month - 1, day);
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) {
    return null;
  }

  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

export function collectPastProjectDateErrors(input: Partial<Record<ProjectDateField, string | null | undefined>>, now = new Date()): ProjectDateValidationError[] {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  return (Object.keys(FIELD_LABELS) as ProjectDateField[])
    .flatMap((field) => {
      const parsed = parseLocalDate(input[field]);
      if (!parsed || parsed >= today) return [];
      return [{ field, message: `${FIELD_LABELS[field]} cannot be in the past.` }];
    });
}

export function mapProjectDateErrors(errors: ProjectDateValidationError[]): Partial<Record<ProjectDateField, string>> {
  return errors.reduce<Partial<Record<ProjectDateField, string>>>((accumulator, error) => {
    accumulator[error.field] = error.message;
    return accumulator;
  }, {});
}