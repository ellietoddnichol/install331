
import React, { useState } from 'react';
import { Project, ProjectSettings } from '../../types';
import { getDistanceInMiles } from '../../utils/geo';
import { MapPin } from 'lucide-react';
import { formatNumberSafe } from '../../utils/numberFormat';

interface Props {
  project: Project;
  onUpdate: (project: Project) => void;
}

export function ProjectSetup({ project, onUpdate }: Props) {
  const [calculatingDistance, setCalculatingDistance] = useState(false);
  const [distance, setDistance] = useState<number | null>(null);

  const handleChange = (field: keyof Project, value: any) => {
    onUpdate({ ...project, [field]: value });
  };

  const handleAddressBlur = async () => {
    if (!project.address) return;
    setCalculatingDistance(true);
    const dist = await getDistanceInMiles(project.address);
    setDistance(dist);
    setCalculatingDistance(false);

    if (dist && dist > 50) {
      onUpdate({
        ...project,
        settings: {
          ...project.settings,
          selectedConditions: { ...project.settings.selectedConditions, remote: true },
          travelSurcharge: 500
        }
      });
    } else {
      onUpdate({
        ...project,
        settings: {
          ...project.settings,
          selectedConditions: { ...project.settings.selectedConditions, remote: false },
          travelSurcharge: 0
        }
      });
    }
  };

  const handleSettingsChange = (field: keyof ProjectSettings, value: any) => {
    onUpdate({
      ...project,
      settings: { ...project.settings, [field]: value }
    });
  };

  const handleConditionToggle = (key: keyof ProjectSettings['selectedConditions']) => {
    onUpdate({
      ...project,
      settings: {
        ...project.settings,
        selectedConditions: {
          ...project.settings.selectedConditions,
          [key]: !project.settings.selectedConditions[key]
        }
      }
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* Left Column: Basic Info */}
      <div className="space-y-8">
        <section className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900 mb-6 flex items-center">
            <span className="w-8 h-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center mr-3 text-sm">01</span>
            Project Information
          </h2>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Project #</label>
              <input
                type="text"
                className="w-full px-4 py-3 bg-gray-50 border-transparent rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all"
                value={project.projectNumber || ''}
                onChange={(e) => handleChange('projectNumber', e.target.value)}
                placeholder="e.g. 2024-001"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Project Name</label>
              <input
                type="text"
                className="w-full px-4 py-3 bg-gray-50 border-transparent rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all"
                value={project.name}
                onChange={(e) => handleChange('name', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Client / GC</label>
              <input
                type="text"
                className="w-full px-4 py-3 bg-gray-50 border-transparent rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all"
                value={project.clientName}
                onChange={(e) => handleChange('clientName', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Project Type</label>
              <select
                className="w-full px-4 py-3 bg-gray-50 border-transparent rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all"
                value={project.projectType || ''}
                onChange={(e) => handleChange('projectType', e.target.value)}
              >
                <option value="">Select Type...</option>
                <option value="Commercial">Commercial</option>
                <option value="Residential">Residential</option>
                <option value="Industrial">Industrial</option>
                <option value="Institutional">Institutional</option>
                <option value="Multi-Family">Multi-Family</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Estimator</label>
              <input
                type="text"
                className="w-full px-4 py-3 bg-gray-50 border-transparent rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all"
                value={project.estimator || ''}
                onChange={(e) => handleChange('estimator', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Status</label>
              <select
                className="w-full px-4 py-3 bg-gray-50 border-transparent rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all"
                value={project.status}
                onChange={(e) => handleChange('status', e.target.value)}
              >
                <option value="Draft">Draft</option>
                <option value="Submitted">Submitted</option>
                <option value="Awarded">Awarded</option>
                <option value="Lost">Lost</option>
                <option value="Archived">Archived</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="flex items-center justify-between text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                <div className="flex items-center space-x-2">
                  <MapPin className="w-3 h-3" />
                  <span>Project Address</span>
                </div>
                {calculatingDistance && <span className="text-blue-500 animate-pulse">Calculating distance...</span>}
                {distance !== null && !calculatingDistance && (
                  <span className={`text-xs ${distance > 50 ? 'text-orange-600 font-bold' : 'text-green-600'}`}>
                    {formatNumberSafe(distance, 1)} miles from office {distance > 50 ? '(Remote Surcharge Applies)' : ''}
                  </span>
                )}
              </label>
              <textarea
                rows={2}
                className="w-full px-4 py-3 bg-gray-50 border-transparent rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all"
                value={project.address}
                onChange={(e) => handleChange('address', e.target.value)}
                onBlur={handleAddressBlur}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Bid Date</label>
              <input
                type="date"
                className="w-full px-4 py-3 bg-gray-50 border-transparent rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all"
                value={project.bidDate || ''}
                onChange={(e) => handleChange('bidDate', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Due Date</label>
              <input
                type="date"
                className="w-full px-4 py-3 bg-gray-50 border-transparent rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all"
                value={project.dueDate || ''}
                onChange={(e) => handleChange('dueDate', e.target.value)}
              />
            </div>
          </div>
        </section>

        <section className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900 mb-6 flex items-center">
            <span className="w-8 h-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center mr-3 text-sm">02</span>
            Financial Settings
          </h2>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Labor Rate ($/hr)</label>
              <input
                type="number"
                className="w-full px-4 py-3 bg-gray-50 border-transparent rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all"
                value={project.settings.laborRate}
                onChange={(e) => handleSettingsChange('laborRate', parseFloat(e.target.value))}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Labor Burden (%)</label>
              <input
                type="number"
                className="w-full px-4 py-3 bg-gray-50 border-transparent rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all"
                value={project.settings.laborBurdenPct * 100}
                onChange={(e) => handleSettingsChange('laborBurdenPct', parseFloat(e.target.value) / 100)}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Tax Rate (%)</label>
              <input
                type="number"
                step="0.01"
                className="w-full px-4 py-3 bg-gray-50 border-transparent rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all"
                value={project.settings.taxRate * 100}
                onChange={(e) => handleSettingsChange('taxRate', parseFloat(e.target.value) / 100)}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Overhead (%)</label>
              <input
                type="number"
                className="w-full px-4 py-3 bg-gray-50 border-transparent rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all"
                value={project.settings.overheadPct * 100}
                onChange={(e) => handleSettingsChange('overheadPct', parseFloat(e.target.value) / 100)}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Profit (%)</label>
              <input
                type="number"
                className="w-full px-4 py-3 bg-gray-50 border-transparent rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all"
                value={project.settings.profitPct * 100}
                onChange={(e) => handleSettingsChange('profitPct', parseFloat(e.target.value) / 100)}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Travel Surcharge ($)</label>
              <input
                type="number"
                className="w-full px-4 py-3 bg-gray-50 border-transparent rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all"
                value={project.settings.travelSurcharge || 0}
                onChange={(e) => handleSettingsChange('travelSurcharge', parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>
        </section>
      </div>

      {/* Right Column: Conditions & Multipliers */}
      <div className="space-y-8">
        <section className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900 mb-6 flex items-center">
            <span className="w-8 h-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center mr-3 text-sm">03</span>
            Project Conditions
          </h2>
          <div className="grid grid-cols-2 gap-4">
            {Object.entries(project.settings.selectedConditions).map(([key, active]) => (
              <button
                key={key}
                onClick={() => handleConditionToggle(key as any)}
                className={`p-4 rounded-xl border-2 text-left transition-all flex justify-between items-center ${
                  active 
                    ? 'border-blue-600 bg-blue-50 text-blue-700' 
                    : 'border-gray-100 bg-gray-50 text-gray-500 hover:border-gray-200'
                }`}
              >
                <span className="font-bold capitalize">{key}</span>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${active ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}>
                  {active && <div className="w-2 h-2 bg-white rounded-full"></div>}
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900 mb-6 flex items-center">
            <span className="w-8 h-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center mr-3 text-sm">04</span>
            Complexity Factors
          </h2>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Project Size</label>
              <select
                className="w-full px-4 py-3 bg-gray-50 border-transparent rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all"
                value={project.settings.projectSize}
                onChange={(e) => handleSettingsChange('projectSize', e.target.value)}
              >
                <option value="Small">Small (&lt;10 Units)</option>
                <option value="Medium">Medium (10-50 Units)</option>
                <option value="Large">Large (50+ Units)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Floor Level</label>
              <select
                className="w-full px-4 py-3 bg-gray-50 border-transparent rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all"
                value={project.settings.floorLevel}
                onChange={(e) => handleSettingsChange('floorLevel', e.target.value)}
              >
                <option value="Ground">Ground Floor</option>
                <option value="2-3">Levels 2-3</option>
                <option value="4+">Levels 4+</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Access Difficulty</label>
              <select
                className="w-full px-4 py-3 bg-gray-50 border-transparent rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all"
                value={project.settings.accessDifficulty}
                onChange={(e) => handleSettingsChange('accessDifficulty', e.target.value)}
              >
                <option value="Easy">Easy / Direct</option>
                <option value="Moderate">Moderate</option>
                <option value="Difficult">Difficult / Restricted</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Wall Substrate</label>
              <select
                className="w-full px-4 py-3 bg-gray-50 border-transparent rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all"
                value={project.settings.wallSubstrate}
                onChange={(e) => handleSettingsChange('wallSubstrate', e.target.value)}
              >
                <option value="Drywall">Drywall / Metal Stud</option>
                <option value="CMU">CMU / Block</option>
                <option value="Concrete">Poured Concrete</option>
                <option value="Tile">Tile / Stone</option>
              </select>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
