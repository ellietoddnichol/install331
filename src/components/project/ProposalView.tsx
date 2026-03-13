
import React from 'react';
import { Project, EstimateResult } from '../../types';
import { Printer, Download, Mail, ShieldCheck } from 'lucide-react';
import { formatCurrencySafe } from '../../utils/numberFormat';

interface Props {
  project: Project;
  estimate: EstimateResult | null;
}

export function ProposalView({ project, estimate }: Props) {
  if (!estimate) return <div className="p-12 text-center text-gray-500">Calculating proposal...</div>;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-8">
      {/* Toolbar */}
      <div className="flex justify-end space-x-3 print:hidden">
        <button className="px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-xl font-semibold flex items-center space-x-2 hover:bg-gray-50 transition-all">
          <Download className="w-4 h-4" />
          <span>Export PDF</span>
        </button>
        <button 
          onClick={handlePrint}
          className="px-4 py-2 bg-blue-600 text-white rounded-xl font-semibold flex items-center space-x-2 hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
        >
          <Printer className="w-4 h-4" />
          <span>Print Proposal</span>
        </button>
      </div>

      {/* Proposal Document */}
      <div className="bg-white p-12 md:p-20 rounded-3xl shadow-xl border border-gray-100 max-w-5xl mx-auto print:shadow-none print:border-none print:p-0">
        {/* Header */}
        <div className="flex justify-between items-start mb-16">
          <div className="flex items-center space-x-4">
            <div className="bg-blue-600 p-3 rounded-2xl">
              <ShieldCheck className="w-8 h-8 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-gray-900 tracking-tighter uppercase">{project.proposalSettings.companyName}</h2>
              <p className="text-sm text-gray-500 font-medium">{project.proposalSettings.companyAddress1}, {project.proposalSettings.companyAddress2}</p>
            </div>
          </div>
          <div className="text-right">
            <h1 className="text-5xl font-black text-gray-900 tracking-tighter mb-2">PROPOSAL</h1>
            <p className="text-sm font-bold text-blue-600 tracking-widest uppercase">Project #{project.id.slice(0, 8)}</p>
          </div>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-2 gap-12 mb-16 pb-12 border-b border-gray-100">
          <div>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Prepared For</h3>
            <p className="text-xl font-bold text-gray-900">{project.clientName}</p>
            <p className="text-gray-500 mt-1">{project.address}</p>
          </div>
          <div className="text-right">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Project Details</h3>
            <p className="text-xl font-bold text-gray-900">{project.name}</p>
            <p className="text-gray-500 mt-1">Bid Date: {project.bidDate || 'TBD'}</p>
          </div>
        </div>

        {/* Scope of Work */}
        <div className="mb-16">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-6">Scope of Work</h3>
          <div className="space-y-8">
            {Object.values(estimate.byScope).map(scope => (
              <div key={scope.id} className="space-y-4">
                <div className="flex justify-between items-end border-b-2 border-gray-900 pb-2">
                  <h4 className="text-lg font-black text-gray-900 uppercase tracking-tight">{scope.name}</h4>
                  <span className="text-lg font-bold text-gray-900">{formatCurrencySafe(scope.total)}</span>
                </div>
                <ul className="grid grid-cols-1 gap-2">
                  {scope.lines.map(line => (
                    <li key={line.lineId} className="flex justify-between text-sm text-gray-600">
                      <span>{line.qty}x {line.description}</span>
                      {project.proposalSettings.showLineItems && (
                        <span className="font-medium text-gray-400">{formatCurrencySafe(line.total)}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Alternates */}
        {Object.keys(estimate.byAlternate).length > 0 && (
          <div className="mb-16">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-6">Bid Alternates (Optional)</h3>
            <div className="space-y-4">
              {Object.values(estimate.byAlternate).map(alt => (
                <div key={alt.id} className="bg-gray-50 p-6 rounded-2xl flex justify-between items-center">
                  <div>
                    <h4 className="font-bold text-gray-900">{alt.name}</h4>
                    <p className="text-sm text-gray-500 mt-1">Optional addition to base bid</p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-bold text-blue-600 uppercase tracking-widest block mb-1">ADD</span>
                    <span className="text-xl font-black text-gray-900">{formatCurrencySafe(alt.total)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Totals */}
        <div className="bg-gray-900 text-white p-12 rounded-3xl flex justify-between items-center">
          <div>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Base Bid Total</h3>
            <p className="text-sm text-gray-400 max-w-xs">Includes all materials, labor, and taxes for the base scope of work as listed above.</p>
          </div>
          <div className="text-right">
            <p className="text-5xl font-black tracking-tighter">
              {formatCurrencySafe(estimate.baseBidTotal)}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-16 pt-16 border-t border-gray-100 grid grid-cols-2 gap-12">
          <div>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Terms & Conditions</h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              {project.proposalSettings.footerText}
            </p>
          </div>
          <div className="flex flex-col justify-end items-end space-y-8">
            <div className="w-64 border-b border-gray-900 pb-2">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Authorized Signature</p>
            </div>
            <div className="w-64 border-b border-gray-900 pb-2">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Date</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
