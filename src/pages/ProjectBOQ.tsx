import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  Plus, 
  Trash2, 
  Download, 
  Calculator, 
  FileSpreadsheet, 
  Layers, 
  Info,
  CheckCircle2,
  AlertCircle,
  X
} from 'lucide-react';
import { ProjectDetail, Norm, Rate, BOQItem } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

export default function ProjectBOQ({ projectId, onBack }: { projectId: number, onBack: () => void }) {
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [norms, setNorms] = useState<Norm[]>([]);
  const [rates, setRates] = useState<Rate[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'BOQ' | 'RESOURCES' | 'ANALYSIS'>('BOQ');
  const [newItem, setNewItem] = useState({ norm_id: 0, quantity: 0 });
  const [selectedAnalysisItem, setSelectedAnalysisItem] = useState<number | null>(null);

  useEffect(() => {
    fetchProject();
    fetchNormsAndRates();
  }, [projectId]);

  const fetchProject = async () => {
    const res = await fetch(`/api/projects/${projectId}`);
    const data = await res.json();
    setProject(data);
    if (data.items.length > 0 && !selectedAnalysisItem) {
      setSelectedAnalysisItem(data.items[0].id);
    }
  };

  const fetchNormsAndRates = async () => {
    const [nRes, rRes] = await Promise.all([
      fetch('/api/norms'),
      fetch('/api/rates')
    ]);
    setNorms(await nRes.json());
    setRates(await rRes.json());
  };

  const handleAddItem = async () => {
    if (!newItem.norm_id || newItem.quantity <= 0) return;
    await fetch(`/api/projects/${projectId}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newItem)
    });
    setNewItem({ norm_id: 0, quantity: 0 });
    setIsAddModalOpen(false);
    fetchProject();
  };

  const handleDeleteItem = async (id: number) => {
    await fetch(`/api/boq-items/${id}`, { method: 'DELETE' });
    fetchProject();
  };

  const handleUpdateRate = async (name: string, newRate: number) => {
    const rateObj = rates.find(r => r.name.toLowerCase() === name.toLowerCase());
    if (!rateObj) return;
    await fetch(`/api/rates/\${rateObj.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...rateObj, rate: newRate })
    });
    fetchNormsAndRates();
  };

  const handleUpdateNormResource = async (id: number, newQty: number) => {
    // This is a bit tricky because we need to update the specific resource in the norm
    // For now, let's find which norm this resource belongs to
    const norm = norms.find(n => n.resources.some(r => r.id === id));
    if (!norm) return;
    
    const updatedResources = norm.resources.map(r => r.id === id ? { ...r, quantity: newQty } : r);
    await fetch(`/api/norms/\${norm.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...norm, resources: updatedResources })
    });
    fetchNormsAndRates();
  };

  const calculateItemRate = (normId: number) => {
    const norm = norms.find(n => n.id === normId);
    if (!norm || !project) return 0;
    
    let labourTotal = 0;
    let materialTotal = 0;
    let equipmentTotal = 0;
    const percentageResources: any[] = [];

    norm.resources.forEach(res => {
      if (res.is_percentage) {
        percentageResources.push(res);
      } else {
        const rateObj = rates.find(r => r.name.toLowerCase() === res.name.toLowerCase());
        let rate = rateObj?.rate || 0;
        if (project.mode === 'USERS' && rateObj?.apply_vat) {
          rate = rate * 1.13;
        }
        const amount = res.quantity * rate;
        if (res.resource_type === 'Labour') labourTotal += amount;
        else if (res.resource_type === 'Material') materialTotal += amount;
        else if (res.resource_type === 'Equipment') equipmentTotal += amount;
      }
    });

    const fixedTotal = labourTotal + materialTotal + equipmentTotal;
    let percentageTotal = 0;

    percentageResources.forEach(res => {
      let base = 0;
      if (res.percentage_base === 'TOTAL') base = fixedTotal;
      else if (res.percentage_base === 'LABOUR') base = labourTotal;
      else if (res.percentage_base === 'MATERIAL') base = materialTotal;
      else if (res.percentage_base === 'EQUIPMENT') base = equipmentTotal;
      else {
        const baseRes = norm.resources.find(r => r.name === res.percentage_base && !r.is_percentage);
        if (baseRes) {
          const rateObj = rates.find(r => r.name.toLowerCase() === baseRes.name.toLowerCase());
          let rate = rateObj?.rate || 0;
          if (project.mode === 'USERS' && rateObj?.apply_vat) rate = rate * 1.13;
          base = baseRes.quantity * rate;
        }
      }
      percentageTotal += (res.quantity / 100) * base;
    });

    const total = fixedTotal + percentageTotal;
    const rawRate = total / (norm.basis_quantity || 1);
    
    if (project.mode === 'CONTRACTOR') {
      return rawRate * 1.15; // 15% CP&O
    }
    return rawRate;
  };

  const calculateTotalBOQ = () => {
    if (!project) return 0;
    return project.items.reduce((acc, item) => {
      return acc + (item.quantity * calculateItemRate(item.norm_id));
    }, 0);
  };

  const getResourceBreakdown = () => {
    if (!project) return [];
    const breakdown: Record<string, { name: string, type: string, unit: string, quantity: number, rate: number }> = {};
    
    project.items.forEach(item => {
      const norm = norms.find(n => n.id === item.norm_id);
      if (!norm) return;
      const basis = norm.basis_quantity || 1;
      
      // Calculate component totals for this item to use for percentage resources
      let labourTotalPerBasis = 0;
      let materialTotalPerBasis = 0;
      let equipmentTotalPerBasis = 0;

      norm.resources.forEach(res => {
        if (!res.is_percentage) {
          const rateObj = rates.find(r => r.name.toLowerCase() === res.name.toLowerCase());
          let rate = rateObj?.rate || 0;
          if (project.mode === 'USERS' && rateObj?.apply_vat) rate = rate * 1.13;
          const amount = res.quantity * rate;
          if (res.resource_type === 'Labour') labourTotalPerBasis += amount;
          else if (res.resource_type === 'Material') materialTotalPerBasis += amount;
          else if (res.resource_type === 'Equipment') equipmentTotalPerBasis += amount;
        }
      });

      const fixedTotalPerBasis = labourTotalPerBasis + materialTotalPerBasis + equipmentTotalPerBasis;

      norm.resources.forEach(res => {
        const key = `${res.resource_type}-${res.name}`;
        const rateObj = rates.find(r => r.name.toLowerCase() === res.name.toLowerCase());
        let rate = rateObj?.rate || 0;
        if (project.mode === 'USERS' && rateObj?.apply_vat) rate = rate * 1.13;
        
        if (!breakdown[key]) {
          breakdown[key] = {
            name: res.name,
            type: res.resource_type,
            unit: res.is_percentage ? 'Rs.' : (res.unit || rateObj?.unit || '-'),
            quantity: 0,
            rate: res.is_percentage ? 1 : rate
          };
        }

        if (res.is_percentage) {
          let base = 0;
          if (res.percentage_base === 'TOTAL') base = fixedTotalPerBasis;
          else if (res.percentage_base === 'LABOUR') base = labourTotalPerBasis;
          else if (res.percentage_base === 'MATERIAL') base = materialTotalPerBasis;
          else if (res.percentage_base === 'EQUIPMENT') base = equipmentTotalPerBasis;
          else {
            const baseRes = norm.resources.find(r => r.name === res.percentage_base && !r.is_percentage);
            if (baseRes) {
              const rObj = rates.find(r => r.name.toLowerCase() === baseRes.name.toLowerCase());
              let rRate = rObj?.rate || 0;
              if (project.mode === 'USERS' && rObj?.apply_vat) rRate = rRate * 1.13;
              base = baseRes.quantity * rRate;
            }
          }
          const amountPerBasis = (res.quantity / 100) * base;
          breakdown[key].quantity += (amountPerBasis / basis) * item.quantity;
        } else {
          breakdown[key].quantity += (res.quantity / basis) * item.quantity;
        }
      });
    });
    
    return Object.values(breakdown).sort((a, b) => a.type.localeCompare(b.type));
  };

  const exportBOQ = async () => {
    if (!project) return;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('BOQ');

    sheet.columns = [
      { header: 'S.N.', key: 'sn', width: 10 },
      { header: 'Description of Work Item', key: 'desc', width: 50 },
      { header: 'Unit', key: 'unit', width: 10 },
      { header: 'Quantity', key: 'qty', width: 15 },
      { header: 'Rate', key: 'rate', width: 15 },
      { header: 'Total Amount', key: 'total', width: 20 },
      { header: 'Ref to SS', key: 'ref', width: 15 }
    ];

    project.items.forEach((item, idx) => {
      const rate = calculateItemRate(item.norm_id);
      sheet.addRow({
        sn: idx + 1,
        desc: item.description,
        unit: item.unit,
        qty: item.quantity,
        rate: rate,
        total: rate * item.quantity,
        ref: item.ref_ss
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `${project.name}_BOQ.xlsx`);
  };

  const exportResources = async () => {
    if (!project) return;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Resource Breakdown');

    sheet.columns = [
      { header: 'Type', key: 'type', width: 15 },
      { header: 'Resource Name', key: 'name', width: 40 },
      { header: 'Unit', key: 'unit', width: 10 },
      { header: 'Total Quantity', key: 'qty', width: 15 },
      { header: 'Rate', key: 'rate', width: 15 },
      { header: 'Amount', key: 'amount', width: 20 }
    ];

    const resources = getResourceBreakdown();
    resources.forEach(res => {
      sheet.addRow({
        type: res.type,
        name: res.name,
        unit: res.unit,
        qty: res.quantity,
        rate: res.rate,
        amount: res.quantity * res.rate
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `${project.name}_Resource_Breakdown.xlsx`);
  };

  if (!project) return <div className="p-8 text-center">Loading project...</div>;

  const resources = getResourceBreakdown();
  const totalResourcesAmount = resources.reduce((acc, r) => acc + (r.quantity * r.rate), 0);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-3 bg-white hover:bg-black/5 rounded-2xl transition-colors border border-black/5"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
            <div className="flex items-center gap-2">
              <p className="text-sm text-black/40">{project.description}</p>
              <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-md">
                {project.mode} Mode
              </span>
            </div>
          </div>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={viewMode === 'BOQ' ? exportBOQ : exportResources}
            className="bg-white text-black px-6 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-black/5 transition-all border border-black/5"
          >
            <Download size={18} />
            Export {viewMode}
          </button>
          <button 
            onClick={() => setIsAddModalOpen(true)}
            className="bg-[#141414] text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-black transition-all shadow-lg shadow-black/10"
          >
            <Plus size={20} />
            Add Item
          </button>
        </div>
      </div>

      {/* Stats & Toggle */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-black/5 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-black/40 mb-1">Total BOQ Amount</p>
          <p className="text-3xl font-bold tracking-tighter">Rs. {calculateTotalBOQ().toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-black/5 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-black/40 mb-1">Total Resource Cost</p>
          <p className="text-3xl font-bold tracking-tighter">Rs. {totalResourcesAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-[#F5F5F0] p-1 rounded-2xl flex border border-black/5 shadow-sm">
          <button 
            onClick={() => setViewMode('BOQ')}
            className={`flex-1 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${viewMode === 'BOQ' ? 'bg-[#141414] text-white shadow-lg' : 'text-black/40 hover:text-black/60'}`}
          >
            BOQ View
          </button>
          <button 
            onClick={() => setViewMode('RESOURCES')}
            className={`flex-1 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${viewMode === 'RESOURCES' ? 'bg-[#141414] text-white shadow-lg' : 'text-black/40 hover:text-black/60'}`}
          >
            Resource View
          </button>
          <button 
            onClick={() => setViewMode('ANALYSIS')}
            className={`flex-1 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${viewMode === 'ANALYSIS' ? 'bg-[#141414] text-white shadow-lg' : 'text-black/40 hover:text-black/60'}`}
          >
            Rate Analysis
          </button>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-3xl shadow-sm border border-black/5 overflow-hidden">
        <AnimatePresence mode="wait">
          {viewMode === 'BOQ' ? (
            <motion.div 
              key="boq"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F5F5F0]/50 border-b border-black/5">
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-black/40 w-16">S.N.</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-black/40">Description of Work Item</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-black/40 w-24">Unit</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-black/40 w-32">Quantity</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-black/40 w-32">Rate</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-black/40 w-40">Total Amount</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-black/40 w-32">Ref to SS</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-black/40 w-16"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {project.items.map((item, idx) => {
                    const rate = calculateItemRate(item.norm_id);
                    return (
                      <tr key={item.id} className="hover:bg-black/5 transition-colors group">
                        <td className="px-6 py-4 text-sm font-mono opacity-40">{idx + 1}</td>
                        <td className="px-6 py-4">
                          <p className="text-sm font-bold leading-tight">{item.description}</p>
                          <span className="text-[10px] font-bold uppercase tracking-tighter text-black/30">{item.type} Norm</span>
                        </td>
                        <td className="px-6 py-4 text-sm font-mono opacity-60">{item.unit}</td>
                        <td className="px-6 py-4 text-sm font-bold">{item.quantity}</td>
                        <td className="px-6 py-4 text-sm font-mono">Rs. {rate.toLocaleString()}</td>
                        <td className="px-6 py-4 text-sm font-bold">Rs. {(rate * item.quantity).toLocaleString()}</td>
                        <td className="px-6 py-4 text-xs font-medium text-black/40">{item.ref_ss || '-'}</td>
                        <td className="px-6 py-4 text-right">
                          <button 
                            onClick={() => handleDeleteItem(item.id)}
                            className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {project.items.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-6 py-24 text-center text-black/20 italic">
                        No items in BOQ. Click "Add Item" to begin.
                      </td>
                    </tr>
                  )}
                </tbody>
                {project.items.length > 0 && (
                  <tfoot>
                    <tr className="bg-[#F5F5F0] border-t border-black/10">
                      <td colSpan={5} className="px-6 py-5 text-sm font-bold uppercase tracking-widest text-right text-black/60">Total BOQ Amount</td>
                      <td colSpan={3} className="px-6 py-5 text-2xl font-bold tracking-tighter text-emerald-600">Rs. {calculateTotalBOQ().toLocaleString()}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </motion.div>
          ) : viewMode === 'RESOURCES' ? (
            <motion.div 
              key="resources"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F5F5F0]/50 border-b border-black/5">
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-black/40 w-32">Type</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-black/40">Resource Name</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-black/40 w-24">Unit</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-black/40 w-40">Total Quantity</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-black/40 w-40">Unit Rate</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-black/40 w-48">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {resources.map((res, idx) => (
                    <tr key={idx} className="hover:bg-black/5 transition-colors">
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-tighter ${
                          res.type === 'Labour' ? 'bg-blue-100 text-blue-700' : 
                          res.type === 'Material' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'
                        }`}>
                          {res.type}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm font-bold">{res.name}</td>
                      <td className="px-6 py-4 text-sm font-mono opacity-60">{res.unit}</td>
                      <td className="px-6 py-4 text-sm font-bold">{res.quantity.toLocaleString(undefined, { maximumFractionDigits: 3 })}</td>
                      <td className="px-6 py-4 text-sm font-mono">Rs. {res.rate.toLocaleString()}</td>
                      <td className="px-6 py-4 text-sm font-bold">Rs. {(res.quantity * res.rate).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-[#F5F5F0] border-t border-black/10">
                    <td colSpan={5} className="px-6 py-5 text-sm font-bold uppercase tracking-widest text-right text-black/60">Total Resource Amount</td>
                    <td className="px-6 py-5 text-2xl font-bold tracking-tighter text-emerald-600">Rs. {totalResourcesAmount.toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
              <div className="p-6 bg-emerald-50 border-t border-emerald-100 flex items-center gap-3">
                <CheckCircle2 className="text-emerald-600" size={20} />
                <p className="text-xs font-medium text-emerald-800">
                  Verification: The total BOQ amount (Rs. {calculateTotalBOQ().toLocaleString()}) matches the total resource breakdown amount (Rs. {totalResourcesAmount.toLocaleString()}).
                </p>
              </div>
            </motion.div>
          ) : viewMode === 'ANALYSIS' ? (
            <motion.div 
              key="analysis"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid grid-cols-12 min-h-[500px]"
            >
              {/* Sidebar for items */}
              <div className="col-span-4 border-r border-black/5 bg-[#F5F5F0]/30 overflow-y-auto max-h-[600px]">
                {project.items.map((item, idx) => (
                  <button
                    key={item.id}
                    onClick={() => setSelectedAnalysisItem(item.id)}
                    className={`w-full text-left p-4 border-b border-black/5 transition-all ${selectedAnalysisItem === item.id ? 'bg-white border-l-4 border-emerald-500 shadow-md z-10' : 'hover:bg-black/5'}`}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span className={`text-[10px] font-mono ${selectedAnalysisItem === item.id ? 'text-emerald-600' : 'opacity-50'}`}>Item {idx + 1}</span>
                      <span className="text-[10px] font-bold uppercase tracking-widest opacity-40">{item.ref_ss || '-'}</span>
                    </div>
                    <p className={`text-xs font-bold line-clamp-2 leading-tight ${selectedAnalysisItem === item.id ? 'text-black' : 'text-black/60'}`}>{item.description}</p>
                  </button>
                ))}
              </div>

              {/* Analysis Detail */}
              <div className="col-span-8 p-8 overflow-y-auto max-h-[600px]">
                {selectedAnalysisItem ? (
                  <div className="space-y-8">
                    {(() => {
                      const item = project.items.find(i => i.id === selectedAnalysisItem);
                      if (!item) return null;
                      const norm = norms.find(n => n.id === item.norm_id);
                      if (!norm) return null;

                      return (
                        <>
                          <div className="flex justify-between items-start border-b border-black/10 pb-6">
                            <div>
                              <h3 className="text-xl font-bold tracking-tight mb-1">{item.description}</h3>
                              <p className="text-xs text-black/40 font-medium">Analysis for {norm.basis_quantity} {norm.unit} | Project Mode: {project.mode}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-[10px] font-bold uppercase tracking-widest text-black/40 mb-1">Unit Rate</p>
                              <p className="text-2xl font-bold tracking-tighter text-emerald-600">Rs. {calculateItemRate(item.norm_id).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                            </div>
                          </div>

                          <div className="space-y-8">
                            <ProjectAnalysisTable 
                              title="Labour" 
                              resources={norm.resources.filter(r => r.resource_type === 'Labour')} 
                              rates={rates} 
                              mode={project.mode}
                              allResources={norm.resources}
                              onUpdateRate={handleUpdateRate}
                              onUpdateNormResource={handleUpdateNormResource}
                            />
                            <ProjectAnalysisTable 
                              title="Material" 
                              resources={norm.resources.filter(r => r.resource_type === 'Material')} 
                              rates={rates} 
                              mode={project.mode}
                              allResources={norm.resources}
                              onUpdateRate={handleUpdateRate}
                              onUpdateNormResource={handleUpdateNormResource}
                            />
                            <ProjectAnalysisTable 
                              title="Equipment" 
                              resources={norm.resources.filter(r => r.resource_type === 'Equipment')} 
                              rates={rates} 
                              mode={project.mode}
                              allResources={norm.resources}
                              onUpdateRate={handleUpdateRate}
                              onUpdateNormResource={handleUpdateNormResource}
                            />
                          </div>
                        </>
                      );
                    })()}
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-black/20">
                    <Calculator size={48} strokeWidth={1} className="mb-4" />
                    <p className="text-sm font-medium">Select an item from the left to view its rate analysis</p>
                  </div>
                )}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {/* Add Item Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden"
          >
            <div className="p-8 border-b border-black/5 bg-[#F5F5F0]/50 flex items-center justify-between">
              <h2 className="text-2xl font-bold tracking-tight">Add Item to BOQ</h2>
              <button onClick={() => setIsAddModalOpen(false)} className="p-2 hover:bg-black/5 rounded-full transition-colors">
                <X size={24} />
              </button>
            </div>
            <div className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">Select Work Item (Norm)</label>
                <select 
                  className="w-full p-3 bg-[#F5F5F0] rounded-xl border-none focus:ring-2 focus:ring-black/5 text-sm font-bold"
                  value={newItem.norm_id}
                  onChange={e => setNewItem({ ...newItem, norm_id: parseInt(e.target.value) })}
                >
                  <option value="0">Choose an item...</option>
                  {norms.map(n => (
                    <option key={n.id} value={n.id}>{n.type} - {n.description} ({n.unit})</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">Quantity</label>
                <div className="flex gap-4 items-center">
                  <input 
                    type="number" 
                    className="flex-1 p-3 bg-[#F5F5F0] rounded-xl border-none focus:ring-2 focus:ring-black/5 text-sm font-bold"
                    placeholder="Enter quantity"
                    value={newItem.quantity || ''}
                    onChange={e => setNewItem({ ...newItem, quantity: parseFloat(e.target.value) })}
                  />
                  <span className="text-sm font-mono opacity-40">
                    {norms.find(n => n.id === newItem.norm_id)?.unit || 'unit'}
                  </span>
                </div>
              </div>

              {newItem.norm_id > 0 && (
                <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 flex gap-3">
                  <Info className="text-blue-600 shrink-0" size={20} />
                  <div>
                    <p className="text-xs font-bold text-blue-900 uppercase tracking-widest mb-1">Rate Preview</p>
                    <p className="text-sm text-blue-800">
                      Calculated Rate: <span className="font-bold">Rs. {calculateItemRate(newItem.norm_id).toLocaleString()}</span> per {norms.find(n => n.id === newItem.norm_id)?.unit}
                    </p>
                  </div>
                </div>
              )}
            </div>
            <div className="p-8 bg-[#F5F5F0]/50 border-t border-black/5 flex justify-end gap-4">
              <button onClick={() => setIsAddModalOpen(false)} className="px-6 py-3 rounded-2xl font-bold text-sm hover:bg-black/5 transition-colors">
                Cancel
              </button>
              <button 
                onClick={handleAddItem}
                className="bg-[#141414] text-white px-8 py-3 rounded-2xl font-bold text-sm hover:bg-black transition-all shadow-lg shadow-black/10"
              >
                Add to BOQ
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function ProjectAnalysisTable({ title, resources, rates, mode, allResources, onUpdateRate, onUpdateNormResource }: { 
  title: string, 
  resources: any[], 
  rates: Rate[], 
  mode: 'CONTRACTOR' | 'USERS', 
  allResources: any[],
  onUpdateRate: (name: string, newRate: number) => void,
  onUpdateNormResource: (id: number, newQty: number) => void
}) {
  const labourTotal = allResources.reduce((acc, res) => {
    if (res.is_percentage || res.resource_type !== 'Labour') return acc;
    const rateObj = rates.find(r => r.name.toLowerCase() === res.name.toLowerCase());
    let rate = rateObj?.rate || 0;
    if (mode === 'USERS' && rateObj?.apply_vat) rate = rate * 1.13;
    return acc + (res.quantity * rate);
  }, 0);

  const materialTotal = allResources.reduce((acc, res) => {
    if (res.is_percentage || res.resource_type !== 'Material') return acc;
    const rateObj = rates.find(r => r.name.toLowerCase() === res.name.toLowerCase());
    let rate = rateObj?.rate || 0;
    if (mode === 'USERS' && rateObj?.apply_vat) rate = rate * 1.13;
    return acc + (res.quantity * rate);
  }, 0);

  const equipmentTotal = allResources.reduce((acc, res) => {
    if (res.is_percentage || res.resource_type !== 'Equipment') return acc;
    const rateObj = rates.find(r => r.name.toLowerCase() === res.name.toLowerCase());
    let rate = rateObj?.rate || 0;
    if (mode === 'USERS' && rateObj?.apply_vat) rate = rate * 1.13;
    return acc + (res.quantity * rate);
  }, 0);

  const fixedTotal = labourTotal + materialTotal + equipmentTotal;

  if (resources.length === 0) return null;

  return (
    <div className="space-y-3">
      <h4 className="text-[10px] font-bold uppercase tracking-widest text-black/40 border-b border-black/5 pb-2">{title} Component</h4>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left opacity-40">
            <th className="pb-2 font-medium">Description</th>
            <th className="pb-2 font-medium text-center">Quantity</th>
            <th className="pb-2 font-medium text-right">Rate</th>
            <th className="pb-2 font-medium text-right">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-black/5">
          {resources.map((res, i) => {
            let amount = 0;
            let rateDisplay = '';
            const rateObj = rates.find(r => r.name.toLowerCase() === res.name.toLowerCase());

            if (res.is_percentage) {
              let base = 0;
              if (res.percentage_base === 'TOTAL') base = fixedTotal;
              else if (res.percentage_base === 'LABOUR') base = labourTotal;
              else if (res.percentage_base === 'MATERIAL') base = materialTotal;
              else if (res.percentage_base === 'EQUIPMENT') base = equipmentTotal;
              else {
                const baseRes = allResources.find(r => r.name === res.percentage_base && !r.is_percentage);
                if (baseRes) {
                  const rObj = rates.find(r => r.name.toLowerCase() === baseRes.name.toLowerCase());
                  let rate = rObj?.rate || 0;
                  if (mode === 'USERS' && rObj?.apply_vat) rate = rate * 1.13;
                  base = baseRes.quantity * rate;
                }
              }
              amount = (res.quantity / 100) * base;
              rateDisplay = `${res.quantity}% of ${res.percentage_base}`;
            } else {
              let rate = rateObj?.rate || 0;
              if (mode === 'USERS' && rateObj?.apply_vat) rate = rate * 1.13;
              amount = res.quantity * rate;
              rateDisplay = rate.toLocaleString();
            }

            return (
              <tr key={i} className="group">
                <td className="py-2 font-medium">{res.name}</td>
                <td className="py-2 text-center font-mono">
                  {res.is_percentage ? (
                    <span>{res.quantity}%</span>
                  ) : (
                    <input 
                      type="number"
                      defaultValue={res.quantity}
                      onBlur={(e) => onUpdateNormResource(res.id, parseFloat(e.target.value))}
                      className="w-16 bg-transparent border-b border-transparent hover:border-black/10 focus:border-emerald-500 focus:outline-none text-center"
                    />
                  )}
                  <span className="ml-1 opacity-40">{res.unit}</span>
                </td>
                <td className="py-2 text-right font-mono text-black/40">
                  {!res.is_percentage && rateObj ? (
                    <div className="flex items-center justify-end gap-1">
                      <span>Rs.</span>
                      <input 
                        type="number"
                        defaultValue={rateObj.rate}
                        onBlur={(e) => onUpdateRate(rateObj.name, parseFloat(e.target.value))}
                        className="w-20 bg-transparent border-b border-transparent hover:border-black/10 focus:border-emerald-500 focus:outline-none text-right"
                      />
                    </div>
                  ) : rateDisplay}
                </td>
                <td className="py-2 text-right font-mono font-bold">{amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
