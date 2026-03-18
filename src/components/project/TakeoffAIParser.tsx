
import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, Loader2, Check, AlertCircle, X, Trash2 } from 'lucide-react';
import { api } from '../../services/api';
import { Project, ProjectLine, CatalogItem } from '../../types';

interface ParsedTakeoffItem {
  description: string;
  qty: number;
  roomName?: string;
  notes?: string;
}

interface Props {
  project: Project;
  catalog: CatalogItem[];
  onImport: (lines: ProjectLine[], newRooms: string[]) => void;
  onClose: () => void;
}

export function TakeoffAIParser({ project, catalog, onImport, onClose }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [results, setResults] = useState<ParsedTakeoffItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      setError(null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf']
    },
    multiple: false
  } as any);

  const handleParse = async () => {
    if (!file) return;
    setParsing(true);
    setError(null);

    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = typeof reader.result === 'string' ? reader.result : '';
          const base64 = result.split(',')[1];
          if (!base64) {
            reject(new Error('Unable to read the uploaded file.'));
            return;
          }
          resolve(base64);
        };
        reader.onerror = () => reject(new Error('Unable to read the uploaded file.'));
      });
      reader.readAsDataURL(file);
      const dataBase64 = await base64Promise;

      const sourceType = 'pdf';
      const parsed = await api.parseV1Intake({
        fileName: file.name,
        mimeType: file.type || 'application/pdf',
        sourceType,
        dataBase64,
        matchCatalog: true,
      });

      const items = parsed.reviewLines.map((line) => ({
        description: line.catalogMatch?.description || line.description || line.itemName,
        qty: Number(line.quantity) || 1,
        roomName: line.roomName || 'General',
        notes: [line.notes, ...line.warnings].filter(Boolean).join(' | '),
      }));

      if (items.length === 0) {
        throw new Error('No usable takeoff lines were found in the uploaded file.');
      }

      setResults(items);
    } catch (err) {
      console.error("AI Parsing failed", err);
      setError(err instanceof Error ? err.message : 'Failed to parse document. Please try again with a clearer file.');
    } finally {
      setParsing(false);
    }
  };

  const handleImport = () => {
    const newLines: ProjectLine[] = [];
    const newRooms: string[] = [];

    results.forEach(item => {
      // Try to match with catalog
      const matchedItem = catalog.find(c => 
        c.description.toLowerCase().includes(item.description.toLowerCase()) ||
        item.description.toLowerCase().includes(c.description.toLowerCase())
      );

      const roomId = item.roomName 
        ? (project.rooms.find(r => r.name.toLowerCase() === item.roomName?.toLowerCase())?.id || item.roomName)
        : project.rooms[0]?.id;

      if (item.roomName && !project.rooms.find(r => r.name.toLowerCase() === item.roomName?.toLowerCase())) {
        if (!newRooms.includes(item.roomName)) newRooms.push(item.roomName);
      }

      newLines.push({
        lineId: crypto.randomUUID(),
        catalogItemId: matchedItem?.id,
        manualDescription: matchedItem ? undefined : item.description,
        scopeId: project.scopes[0]?.id || 'div10',
        roomId: roomId,
        qty: item.qty,
        notes: item.notes,
        baseType: 'Metal'
      });
    });

    onImport(newLines, newRooms);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-8 bg-gray-900/60 backdrop-blur-sm">
      <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-purple-100 p-2 rounded-lg">
              <Upload className="w-6 h-6 text-purple-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">AI Takeoff Parser</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl text-gray-400 transition-all">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8">
          {results.length === 0 ? (
            <div className="space-y-8">
              <div 
                {...getRootProps()} 
                className={`border-4 border-dashed rounded-3xl p-12 text-center transition-all cursor-pointer ${
                  isDragActive ? 'border-purple-500 bg-purple-50' : 'border-gray-100 hover:border-purple-200 hover:bg-gray-50'
                }`}
              >
                <input {...getInputProps()} />
                <div className="bg-purple-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                  <FileText className="w-10 h-10 text-purple-600" />
                </div>
                {file ? (
                  <div>
                    <p className="text-xl font-bold text-gray-900">{file.name}</p>
                    <p className="text-gray-500 mt-2">Click or drag to replace file</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-xl font-bold text-gray-900">Upload Takeoff Document</p>
                    <p className="text-gray-500 mt-2">PDF only (schedules, drawings, specs)</p>
                  </div>
                )}
              </div>

              {error && (
                <div className="bg-red-50 border border-red-100 p-4 rounded-2xl flex items-center space-x-3 text-red-700">
                  <AlertCircle className="w-5 h-5" />
                  <p className="font-medium">{error}</p>
                </div>
              )}

              <button
                onClick={handleParse}
                disabled={!file || parsing}
                className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white py-4 rounded-2xl font-bold text-lg shadow-xl shadow-purple-100 transition-all flex items-center justify-center space-x-3"
              >
                {parsing ? (
                  <>
                    <Loader2 className="w-6 h-6 animate-spin" />
                    <span>Analyzing Document...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-6 h-6" />
                    <span>Extract Takeoff Data</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900">Extracted Items ({results.length})</h3>
                <button onClick={() => setResults([])} className="text-sm font-bold text-purple-600 hover:underline">
                  Start Over
                </button>
              </div>

              <div className="bg-gray-50 rounded-2xl border border-gray-100 overflow-hidden">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-gray-100/50 border-b border-gray-200">
                      <th className="px-6 py-3 text-xs font-bold text-gray-400 uppercase tracking-widest">Description</th>
                      <th className="px-6 py-3 text-xs font-bold text-gray-400 uppercase tracking-widest text-center w-24">Qty</th>
                      <th className="px-6 py-3 text-xs font-bold text-gray-400 uppercase tracking-widest">Location</th>
                      <th className="px-6 py-3 text-xs font-bold text-gray-400 uppercase tracking-widest w-16"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {results.map((item, i) => (
                      <tr key={i}>
                        <td className="px-6 py-4">
                          <input
                            type="text"
                            className="w-full px-2 py-1 bg-white border border-gray-200 rounded text-sm font-bold"
                            value={item.description}
                            onChange={(e) => {
                              const newResults = [...results];
                              newResults[i].description = e.target.value;
                              setResults(newResults);
                            }}
                          />
                          {item.notes && <div className="text-xs text-gray-500 mt-1">{item.notes}</div>}
                        </td>
                        <td className="px-6 py-4">
                          <input
                            type="number"
                            className="w-full px-2 py-1 bg-white border border-gray-200 rounded text-sm font-bold text-center"
                            value={item.qty}
                            onChange={(e) => {
                              const newResults = [...results];
                              newResults[i].qty = parseFloat(e.target.value) || 0;
                              setResults(newResults);
                            }}
                          />
                        </td>
                        <td className="px-6 py-4">
                          <input
                            type="text"
                            className="w-full px-2 py-1 bg-white border border-gray-200 rounded text-sm font-bold"
                            value={item.roomName || ''}
                            placeholder="General"
                            onChange={(e) => {
                              const newResults = [...results];
                              newResults[i].roomName = e.target.value;
                              setResults(newResults);
                            }}
                          />
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button 
                            onClick={() => setResults(results.filter((_, idx) => idx !== i))}
                            className="p-1 text-gray-300 hover:text-red-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100">
                <p className="text-sm text-blue-800 font-medium leading-relaxed">
                  <strong>Note:</strong> We'll attempt to match these items with your catalog. Items that don't match will be added as manual entries. New rooms will be created automatically.
                </p>
              </div>

              <button
                onClick={handleImport}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-2xl font-bold text-lg shadow-xl shadow-blue-100 transition-all"
              >
                Import into Project
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
