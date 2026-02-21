import React, { useState, useEffect } from 'react';
import { Plus, Search, Filter, Trash2, Edit, ChevronDown, ChevronUp, Info, X } from 'lucide-react';
import { Norm, Resource, Rate } from '../types';
import { motion, AnimatePresence } from 'motion/react';

export default function Norms() {
  const [norms, setNorms] = useState<Norm[]>([]);
  const [filter, setFilter] = useState<'ALL' | 'DOR' | 'DUDBC'>('ALL');
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingNorm, setEditingNorm] = useState<Norm | null>(null);
  const [expandedNorm, setExpandedNorm] = useState<number | null>(null);
  const [allRates, setAllRates] = useState<Rate[]>([]);

  useEffect(() => {
    fetchNorms();
    fetchRates();
  }, []);

  const fetchNorms = async () => {
    const res = await fetch('/api/norms');
    const data = await res.json();
    setNorms(data);
  };

  const fetchRates = async () => {
    const res = await fetch('/api/rates');
    const data = await res.json();
    setAllRates(data);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this norm?')) return;
    await fetch(`/api/norms/${id}`, { method: 'DELETE' });
    fetchNorms();
  };

  const filteredNorms = norms.filter(n => {
    const matchesFilter = filter === 'ALL' || n.type === filter;
    const matchesSearch = n.description.toLowerCase().includes(search.toLowerCase()) || 
                         n.ref_ss?.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div className="space-y-1">
          <h1 className="text-4xl font-bold tracking-tighter italic">Norms Library</h1>
          <p className="text-black/50">Manage DOR and DUDBC standard norms for construction items.</p>
        </div>
        <button 
          onClick={() => { setEditingNorm(null); setIsModalOpen(true); }}
          className="bg-[#141414] text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-black transition-all shadow-lg shadow-black/10"
        >
          <Plus size={20} />
          Add Norm
        </button>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-black/30" size={18} />
          <input 
            type="text" 
            placeholder="Search norms by description or reference..."
            className="w-full pl-12 pr-4 py-3 bg-white border border-black/5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-black/5 transition-all"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex bg-white p-1 rounded-2xl border border-black/5">
          {(['ALL', 'DOR', 'DUDBC'] as const).map(type => (
            <button
              key={type}
              onClick={() => setFilter(type)}
              className={`px-6 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${filter === type ? 'bg-[#141414] text-white shadow-md' : 'text-black/40 hover:text-black/60'}`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-black/5 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-bottom border-black/5 bg-[#F5F5F0]/50">
              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-black/40">Type</th>
              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-black/40">Description</th>
              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-black/40">Unit</th>
              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-black/40">Ref to SS</th>
              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-black/40 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {filteredNorms.map(norm => (
              <React.Fragment key={norm.id}>
                <tr 
                  className={`hover:bg-black/5 transition-colors cursor-pointer ${expandedNorm === norm.id ? 'bg-black/5' : ''}`}
                  onClick={() => setExpandedNorm(expandedNorm === norm.id ? null : norm.id)}
                >
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-tighter ${norm.type === 'DOR' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                      {norm.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-medium text-sm">{norm.description}</td>
                  <td className="px-6 py-4 text-sm font-mono opacity-60">
                    {norm.unit}
                    <span className="text-[10px] block opacity-40">Basis: {norm.basis_quantity}</span>
                  </td>
                  <td className="px-6 py-4 text-xs font-medium text-black/40">{norm.ref_ss || '-'}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2" onClick={e => e.stopPropagation()}>
                      <button 
                        onClick={() => { setEditingNorm(norm); setIsModalOpen(true); }}
                        className="p-2 hover:bg-black/10 rounded-xl transition-colors text-black/60"
                      >
                        <Edit size={16} />
                      </button>
                      <button 
                        onClick={() => handleDelete(norm.id)}
                        className="p-2 hover:bg-red-50 rounded-xl transition-colors text-red-500"
                      >
                        <Trash2 size={16} />
                      </button>
                      {expandedNorm === norm.id ? <ChevronUp size={16} className="opacity-20" /> : <ChevronDown size={16} className="opacity-20" />}
                    </div>
                  </td>
                </tr>
                <AnimatePresence>
                  {expandedNorm === norm.id && (
                    <motion.tr
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                    >
                      <td colSpan={5} className="px-6 py-4 bg-[#F5F5F0]/30">
                        <div className="grid grid-cols-3 gap-8">
                          <ResourceList title="Labour" resources={norm.resources.filter(r => r.resource_type === 'Labour')} />
                          <ResourceList title="Material" resources={norm.resources.filter(r => r.resource_type === 'Material')} />
                          <ResourceList title="Equipment" resources={norm.resources.filter(r => r.resource_type === 'Equipment')} />
                        </div>
                      </td>
                    </motion.tr>
                  )}
                </AnimatePresence>
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <NormModal 
          norm={editingNorm} 
          availableRates={allRates}
          onClose={() => setIsModalOpen(false)} 
          onSave={() => { fetchNorms(); fetchRates(); setIsModalOpen(false); }} 
        />
      )}
    </div>
  );
}

function ResourceList({ title, resources }: { title: string, resources: Resource[] }) {
  return (
    <div className="space-y-2">
      <h4 className="text-[10px] font-bold uppercase tracking-widest text-black/40 border-b border-black/5 pb-1">{title}</h4>
      {resources.length > 0 ? (
        <ul className="space-y-1">
          {resources.map((r, i) => (
            <li key={i} className="flex justify-between text-xs">
              <span className="text-black/60">{r.name}</span>
              <span className="font-mono font-bold">
                {r.is_percentage ? `${r.quantity}%` : r.quantity} 
                <span className="text-[10px] opacity-40 ml-1">
                  {r.is_percentage ? `of ${r.percentage_base?.toLowerCase()}` : (r.unit || '-')}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[10px] italic text-black/20">No {title.toLowerCase()} required</p>
      )}
    </div>
  );
}

function NormModal({ norm, availableRates, onClose, onSave }: { norm: Norm | null, availableRates: Rate[], onClose: () => void, onSave: () => void }) {
  const [formData, setFormData] = useState<Partial<Norm>>(norm || {
    type: 'DOR',
    description: '',
    unit: '',
    basis_quantity: 1,
    ref_ss: '',
    resources: []
  });

  const [newResource, setNewResource] = useState<Resource>({
    resource_type: 'Labour',
    name: '',
    unit: '',
    quantity: 0,
    is_percentage: false,
    percentage_base: 'TOTAL'
  });

  const [showSuggestions, setShowSuggestions] = useState(false);

  const suggestions = availableRates.filter(r => 
    r.resource_type === newResource.resource_type &&
    r.name.toLowerCase().includes(newResource.name.toLowerCase()) &&
    newResource.name.length >= 2
  );

  const addResource = () => {
    if (!newResource.name || newResource.quantity <= 0) return;
    setFormData({
      ...formData,
      resources: [...(formData.resources || []), { ...newResource }]
    });
    setNewResource({ ...newResource, name: '', unit: '', quantity: 0, is_percentage: false, percentage_base: 'TOTAL' });
    setShowSuggestions(false);
  };

  const updateResource = (index: number, field: keyof Resource, value: any) => {
    const updatedResources = [...(formData.resources || [])];
    updatedResources[index] = { ...updatedResources[index], [field]: value };
    setFormData({ ...formData, resources: updatedResources });
  };

  const removeResource = (index: number) => {
    setFormData({
      ...formData,
      resources: formData.resources?.filter((_, i) => i !== index)
    });
  };

  const handleSave = async () => {
    if (!formData.description || !formData.unit) {
      alert('Please fill in description and unit');
      return;
    }
    const method = norm ? 'PUT' : 'POST';
    const url = norm ? `/api/norms/${norm.id}` : '/api/norms';
    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });
    onSave();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="p-8 border-b border-black/5 flex items-center justify-between bg-[#F5F5F0]/50">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{norm ? 'Edit Norm' : 'Add New Norm'}</h2>
            <p className="text-xs text-black/40 uppercase tracking-widest font-bold mt-1">Standard Specification Reference</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-black/5 rounded-full transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">Norm Type</label>
              <select 
                className="w-full p-3 bg-[#F5F5F0] rounded-xl border-none focus:ring-2 focus:ring-black/5 font-bold text-sm"
                value={formData.type}
                onChange={e => setFormData({ ...formData, type: e.target.value as 'DOR' | 'DUDBC' })}
              >
                <option value="DOR">DOR (Roads)</option>
                <option value="DUDBC">DUDBC (Buildings)</option>
              </select>
            </div>
            <div className="md:col-span-2 space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">Description of Work Item</label>
              <input 
                type="text" 
                className="w-full p-3 bg-[#F5F5F0] rounded-xl border-none focus:ring-2 focus:ring-black/5 text-sm"
                placeholder="e.g. Earthwork in excavation..."
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">Unit</label>
              <input 
                type="text" 
                className="w-full p-3 bg-[#F5F5F0] rounded-xl border-none focus:ring-2 focus:ring-black/5 text-sm font-mono"
                placeholder="m3, m2, kg, etc."
                value={formData.unit}
                onChange={e => setFormData({ ...formData, unit: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">Basis Quantity</label>
              <input 
                type="number" 
                className="w-full p-3 bg-[#F5F5F0] rounded-xl border-none focus:ring-2 focus:ring-black/5 text-sm font-mono font-bold"
                placeholder="1.0"
                value={formData.basis_quantity || ''}
                onChange={e => setFormData({ ...formData, basis_quantity: parseFloat(e.target.value) || 1 })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">Ref to SS</label>
              <input 
                type="text" 
                className="w-full p-3 bg-[#F5F5F0] rounded-xl border-none focus:ring-2 focus:ring-black/5 text-sm"
                placeholder="Clause 601"
                value={formData.ref_ss}
                onChange={e => setFormData({ ...formData, ref_ss: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold tracking-tight">Resource Breakdown</h3>
              <div className="flex gap-2">
                <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-1 rounded-lg uppercase">Labour</span>
                <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-1 rounded-lg uppercase">Material</span>
                <span className="text-[10px] font-bold bg-orange-100 text-orange-700 px-2 py-1 rounded-lg uppercase">Equipment</span>
              </div>
            </div>

            <div className="bg-[#F5F5F0] p-6 rounded-2xl space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <select 
                  className="p-3 bg-white rounded-xl border-none text-xs font-bold"
                  value={newResource.resource_type}
                  onChange={e => setNewResource({ ...newResource, resource_type: e.target.value as any })}
                >
                  <option value="Labour">Labour</option>
                  <option value="Material">Material</option>
                  <option value="Equipment">Equipment</option>
                </select>
                <div className="relative md:col-span-2">
                  <input 
                    type="text" 
                    placeholder="Resource Name"
                    className="w-full p-3 bg-white rounded-xl border-none text-xs"
                    value={newResource.name}
                    onChange={e => {
                      setNewResource({ ...newResource, name: e.target.value });
                      setShowSuggestions(true);
                    }}
                    onFocus={() => setShowSuggestions(true)}
                  />
                  {showSuggestions && suggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 bg-white shadow-xl rounded-xl mt-1 z-[110] border border-black/5 overflow-hidden max-h-48 overflow-y-auto">
                      {suggestions.map((s, i) => (
                        <button
                          key={i}
                          className="w-full text-left p-3 text-xs hover:bg-black/5 flex justify-between items-center"
                          onClick={() => {
                            setNewResource({ 
                              ...newResource, 
                              name: s.name, 
                              unit: s.unit || newResource.unit 
                            });
                            setShowSuggestions(false);
                          }}
                        >
                          <span className="font-medium">{s.name}</span>
                          <span className="text-[10px] opacity-40 uppercase">{s.unit}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <input 
                  type="text" 
                  placeholder="Unit"
                  className="p-3 bg-white rounded-xl border-none text-xs font-mono"
                  value={newResource.unit}
                  onChange={e => setNewResource({ ...newResource, unit: e.target.value })}
                />
                <div className="flex gap-2">
                  <div className="flex flex-col gap-1 shrink-0">
                    <label className="text-[8px] font-bold uppercase opacity-40 px-1">Is %?</label>
                    <input 
                      type="checkbox"
                      className="w-5 h-5 rounded border-black/10 text-black focus:ring-black/5 mx-auto"
                      checked={!!newResource.is_percentage}
                      onChange={e => setNewResource({ 
                        ...newResource, 
                        is_percentage: e.target.checked,
                        unit: e.target.checked ? '%' : newResource.unit,
                        percentage_base: e.target.checked ? 'TOTAL' : undefined
                      })}
                    />
                  </div>
                  {newResource.is_percentage && (
                    <div className="flex flex-col gap-1 shrink-0 w-32">
                      <label className="text-[8px] font-bold uppercase opacity-40 px-1">% of what?</label>
                      <select 
                        className="p-2 bg-white rounded-xl border-none text-[10px] font-bold h-full"
                        value={newResource.percentage_base}
                        onChange={e => setNewResource({ ...newResource, percentage_base: e.target.value })}
                      >
                        <option value="TOTAL">Total Cost</option>
                        <option value="LABOUR">Total Labour</option>
                        <option value="MATERIAL">Total Material</option>
                        <option value="EQUIPMENT">Total Equipment</option>
                        <optgroup label="Specific Resources">
                          {formData.resources?.filter(r => !r.is_percentage).map((r, i) => (
                            <option key={i} value={r.name}>{r.name}</option>
                          ))}
                        </optgroup>
                      </select>
                    </div>
                  )}
                  <input 
                    type="number" 
                    placeholder={newResource.is_percentage ? "% Value" : "Qty"}
                    className="p-3 bg-white rounded-xl border-none text-xs flex-1 font-mono"
                    value={newResource.quantity || ''}
                    onChange={e => setNewResource({ ...newResource, quantity: parseFloat(e.target.value) })}
                  />
                  <button 
                    onClick={addResource}
                    className="bg-[#141414] text-white p-3 rounded-xl hover:bg-black transition-colors"
                  >
                    <Plus size={18} />
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {formData.resources?.map((res, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-white p-3 rounded-xl shadow-sm border border-black/5 gap-4">
                    <div className="flex items-center gap-3 flex-1">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${
                        res.resource_type === 'Labour' ? 'bg-blue-500' : 
                        res.resource_type === 'Material' ? 'bg-emerald-500' : 'bg-orange-500'
                      }`} />
                      <span className="text-xs font-bold w-20 shrink-0">{res.resource_type}</span>
                      <input 
                        type="text"
                        className="text-xs bg-transparent border-none p-0 focus:ring-0 flex-1 font-medium"
                        value={res.name}
                        onChange={(e) => updateResource(idx, 'name', e.target.value)}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col items-center gap-1 mr-2">
                        <span className="text-[8px] font-bold uppercase opacity-40">%?</span>
                        <input 
                          type="checkbox"
                          checked={!!res.is_percentage}
                          onChange={(e) => updateResource(idx, 'is_percentage', e.target.checked)}
                          className="w-3 h-3 rounded border-black/10 text-black focus:ring-black/5"
                        />
                      </div>
                      {res.is_percentage && (
                        <select 
                          className="text-[10px] bg-black/5 border-none px-2 py-1 rounded w-24 font-bold focus:ring-1 focus:ring-black/10"
                          value={res.percentage_base}
                          onChange={(e) => updateResource(idx, 'percentage_base', e.target.value)}
                        >
                          <option value="TOTAL">Total</option>
                          <option value="LABOUR">Labour</option>
                          <option value="MATERIAL">Material</option>
                          <option value="EQUIPMENT">Equip.</option>
                          {formData.resources?.filter((r, i) => !r.is_percentage && i !== idx).map((r, i) => (
                            <option key={i} value={r.name}>{r.name}</option>
                          ))}
                        </select>
                      )}
                      <input 
                        type="text"
                        className="text-[10px] bg-black/5 border-none px-2 py-1 rounded w-16 font-mono focus:ring-1 focus:ring-black/10"
                        value={res.unit || ''}
                        placeholder="Unit"
                        onChange={(e) => updateResource(idx, 'unit', e.target.value)}
                      />
                      <input 
                        type="number"
                        className="text-xs font-mono font-bold bg-black/5 border-none px-2 py-1 rounded w-20 text-right focus:ring-1 focus:ring-black/10"
                        value={res.quantity}
                        onChange={(e) => updateResource(idx, 'quantity', parseFloat(e.target.value) || 0)}
                      />
                      <button onClick={() => removeResource(idx)} className="text-red-400 hover:text-red-600 transition-colors p-1">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="p-8 bg-[#F5F5F0]/50 border-t border-black/5 flex justify-end gap-4">
          <button onClick={onClose} className="px-6 py-3 rounded-2xl font-bold text-sm hover:bg-black/5 transition-colors">
            Cancel
          </button>
          <button 
            onClick={handleSave}
            className="bg-[#141414] text-white px-8 py-3 rounded-2xl font-bold text-sm hover:bg-black transition-all shadow-lg shadow-black/10"
          >
            Save Norm
          </button>
        </div>
      </motion.div>
    </div>
  );
}
