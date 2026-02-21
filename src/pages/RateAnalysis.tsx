import React, { useState, useEffect } from 'react';
import { Search, Calculator, Info, ChevronRight } from 'lucide-react';
import { Norm, Rate } from '../types';
import { motion } from 'motion/react';

export default function RateAnalysis() {
  const [norms, setNorms] = useState<Norm[]>([]);
  const [rates, setRates] = useState<Rate[]>([]);
  const [search, setSearch] = useState('');
  const [selectedNorm, setSelectedNorm] = useState<Norm | null>(null);
  const [mode, setMode] = useState<'CONTRACTOR' | 'USERS'>('CONTRACTOR');
  const [normType, setNormType] = useState<'ALL' | 'DOR' | 'DUDBC'>('ALL');

  useEffect(() => {
    const fetchData = async () => {
      const [nRes, rRes] = await Promise.all([
        fetch('/api/norms'),
        fetch('/api/rates')
      ]);
      setNorms(await nRes.json());
      setRates(await rRes.json());
    };
    fetchData();
  }, []);

  const calculateRawTotal = (norm: Norm) => {
    let labourTotal = 0;
    let materialTotal = 0;
    let equipmentTotal = 0;
    const percentageResources: any[] = [];

    norm.resources.forEach(res => {
      if (res.is_percentage) {
        percentageResources.push(res);
      } else {
        const rateObj = rates.find(r => r.name.toLowerCase() === res.name.toLowerCase());
        if (rateObj) {
          let rate = rateObj.rate;
          if (mode === 'USERS' && rateObj.apply_vat) {
            rate = rate * 1.13;
          }
          const amount = res.quantity * rate;
          if (res.resource_type === 'Labour') labourTotal += amount;
          else if (res.resource_type === 'Material') materialTotal += amount;
          else if (res.resource_type === 'Equipment') equipmentTotal += amount;
        }
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
        // Specific resource base
        const baseRes = norm.resources.find(r => r.name === res.percentage_base && !r.is_percentage);
        if (baseRes) {
          const rateObj = rates.find(r => r.name.toLowerCase() === baseRes.name.toLowerCase());
          if (rateObj) {
            let rate = rateObj.rate;
            if (mode === 'USERS' && rateObj.apply_vat) rate = rate * 1.13;
            base = baseRes.quantity * rate;
          }
        }
      }
      percentageTotal += (res.quantity / 100) * base;
    });

    return fixedTotal + percentageTotal;
  };

  const calculateTotalCost = (norm: Norm) => {
    const rawTotal = calculateRawTotal(norm);
    if (mode === 'CONTRACTOR') {
      return rawTotal * 1.15; // 15% CP&O
    }
    return rawTotal;
  };

  const calculateItemRate = (norm: Norm) => {
    const totalCost = calculateTotalCost(norm);
    return totalCost / (norm.basis_quantity || 1);
  };

  const filteredNorms = norms.filter(n => 
    n.description.toLowerCase().includes(search.toLowerCase()) &&
    (normType === 'ALL' || n.type === normType)
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h1 className="text-4xl font-bold tracking-tighter italic">Rate Analysis</h1>
          <div className="flex items-center gap-4">
            <select 
              value={normType}
              onChange={(e) => setNormType(e.target.value as any)}
              className="bg-white px-4 py-2 rounded-xl border border-black/5 text-xs font-bold uppercase tracking-widest focus:outline-none shadow-sm"
            >
              <option value="ALL">All Norms</option>
              <option value="DOR">DOR Norms</option>
              <option value="DUDBC">DUDBC Norms</option>
            </select>
            <div className="flex bg-white p-1 rounded-2xl border border-black/5 shadow-sm">
            <button
              onClick={() => setMode('CONTRACTOR')}
              className={`px-6 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${mode === 'CONTRACTOR' ? 'bg-[#141414] text-white shadow-md' : 'text-black/40 hover:text-black/60'}`}
            >
              Contractor
            </button>
            <button
              onClick={() => setMode('USERS')}
              className={`px-6 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${mode === 'USERS' ? 'bg-[#141414] text-white shadow-md' : 'text-black/40 hover:text-black/60'}`}
            >
              Users Committee
            </button>
          </div>
        </div>
      </div>
      <p className="text-black/50">Dynamic calculation of item rates based on current resource prices.</p>
    </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Norm Selection List */}
        <div className="lg:col-span-1 space-y-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-black/30" size={18} />
            <input 
              type="text" 
              placeholder="Search items..."
              className="w-full pl-12 pr-4 py-3 bg-white border border-black/5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-black/5 transition-all"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="bg-white rounded-3xl border border-black/5 overflow-hidden shadow-sm max-h-[600px] overflow-y-auto">
            <div className="grid grid-cols-12 bg-[#F5F5F0]/50 border-b border-black/5 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-black/40">
              <div className="col-span-2">Ref</div>
              <div className="col-span-7">Description</div>
              <div className="col-span-3 text-right">Rate</div>
            </div>
            {filteredNorms.map(norm => {
              const unitRate = calculateItemRate(norm);
              return (
                <button
                  key={norm.id}
                  onClick={() => setSelectedNorm(norm)}
                  className={`w-full text-left p-4 border-b border-black/5 transition-colors grid grid-cols-12 items-center gap-2 group ${selectedNorm?.id === norm.id ? 'bg-[#141414] text-white' : 'hover:bg-[#F5F5F0]'}`}
                >
                  <div className="col-span-2 text-[10px] font-mono opacity-60 truncate">
                    {norm.ref_ss || '-'}
                  </div>
                  <div className="col-span-7">
                    <p className="text-xs font-medium line-clamp-2">{norm.description}</p>
                  </div>
                  <div className="col-span-3 text-right">
                    <p className="text-xs font-bold font-mono">
                      {unitRate.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Analysis Detail */}
        <div className="lg:col-span-2">
          {selectedNorm ? (
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-white rounded-3xl shadow-xl border border-black/5 overflow-hidden"
            >
                <div className="p-8 bg-[#141414] text-white">
                  <div className="flex items-start justify-between mb-4">
                    <span className="px-3 py-1 bg-white/10 rounded-lg text-xs font-bold uppercase tracking-widest">{selectedNorm.type} Norm</span>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-xs font-mono opacity-50">Ref: {selectedNorm.ref_ss || 'N/A'}</span>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">{mode === 'CONTRACTOR' ? 'Contractor Mode (Excl. VAT + 15% CP&O)' : 'Users Committee Mode (Incl. VAT)'}</span>
                    </div>
                  </div>
                  <h2 className="text-2xl font-bold tracking-tight mb-2">{selectedNorm.description}</h2>
                  <p className="text-sm opacity-60">Analysis for {selectedNorm.basis_quantity} {selectedNorm.unit} of work</p>
                </div>

                <div className="p-8 space-y-8">
                  <AnalysisTable 
                    title="Labour Component" 
                    resources={selectedNorm.resources.filter(r => r.resource_type === 'Labour')} 
                    rates={rates} 
                    color="blue"
                    mode={mode}
                    allResources={selectedNorm.resources}
                  />
                  <AnalysisTable 
                    title="Material Component" 
                    resources={selectedNorm.resources.filter(r => r.resource_type === 'Material')} 
                    rates={rates} 
                    color="emerald"
                    mode={mode}
                    allResources={selectedNorm.resources}
                  />
                  <AnalysisTable 
                    title="Equipment Component" 
                    resources={selectedNorm.resources.filter(r => r.resource_type === 'Equipment')} 
                    rates={rates} 
                    color="orange"
                    mode={mode}
                    allResources={selectedNorm.resources}
                  />

                  <div className="pt-8 border-t border-black/10 space-y-4">
                    {mode === 'CONTRACTOR' && (
                      <>
                        <div className="flex justify-between items-center text-sm">
                          <div className="flex flex-col">
                            <span className="text-black/40 font-bold uppercase tracking-widest text-[10px]">Total Cost (Excl. CP&O)</span>
                            <span className="text-[9px] opacity-40">Rate per {selectedNorm.unit}: Rs. {(calculateRawTotal(selectedNorm) / (selectedNorm.basis_quantity || 1)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </div>
                          <span className="font-mono font-bold">Rs. {calculateRawTotal(selectedNorm).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <div className="flex flex-col">
                            <span className="text-black/40 font-bold uppercase tracking-widest text-[10px]">Contractor Profit & Overhead (15%)</span>
                            <span className="text-[9px] opacity-40">Rate per {selectedNorm.unit}: Rs. {(calculateRawTotal(selectedNorm) * 0.15 / (selectedNorm.basis_quantity || 1)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </div>
                          <span className="font-mono font-bold">Rs. {(calculateRawTotal(selectedNorm) * 0.15).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                      </>
                    )}
                    
                    <div className="grid grid-cols-2 gap-8 pt-4 border-t border-black/5">
                      <div className="flex flex-col items-start gap-2">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-black/40">Total Cost (for {selectedNorm.basis_quantity} {selectedNorm.unit})</p>
                        <div className="flex items-baseline gap-2">
                          <span className="text-xs font-medium text-black/40">Rs.</span>
                          <span className="text-3xl font-bold tracking-tighter">{calculateTotalCost(selectedNorm).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-2">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-black/40">Rate per {selectedNorm.unit}</p>
                        <div className="flex items-baseline gap-2">
                          <span className="text-xs font-medium text-black/40">Rs.</span>
                          <span className="text-3xl font-bold tracking-tighter text-emerald-600">{calculateItemRate(selectedNorm).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
            </motion.div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-black/20 bg-white/50 rounded-3xl border-2 border-dashed border-black/5">
              <Calculator size={64} strokeWidth={1} className="mb-4" />
              <p className="font-medium">Select an item from the left to view rate analysis</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AnalysisTable({ title, resources, rates, color, mode, allResources }: { title: string, resources: any[], rates: Rate[], color: string, mode: 'CONTRACTOR' | 'USERS', allResources: any[] }) {
  // Totals for percentage calculations
  const labourTotal = allResources.reduce((acc, res) => {
    if (res.is_percentage || res.resource_type !== 'Labour') return acc;
    const rateObj = rates.find(r => r.name.toLowerCase() === res.name.toLowerCase());
    if (!rateObj) return acc;
    let rate = rateObj.rate;
    if (mode === 'USERS' && rateObj.apply_vat) rate = rate * 1.13;
    return acc + (res.quantity * rate);
  }, 0);

  const materialTotal = allResources.reduce((acc, res) => {
    if (res.is_percentage || res.resource_type !== 'Material') return acc;
    const rateObj = rates.find(r => r.name.toLowerCase() === res.name.toLowerCase());
    if (!rateObj) return acc;
    let rate = rateObj.rate;
    if (mode === 'USERS' && rateObj.apply_vat) rate = rate * 1.13;
    return acc + (res.quantity * rate);
  }, 0);

  const equipmentTotal = allResources.reduce((acc, res) => {
    if (res.is_percentage || res.resource_type !== 'Equipment') return acc;
    const rateObj = rates.find(r => r.name.toLowerCase() === res.name.toLowerCase());
    if (!rateObj) return acc;
    let rate = rateObj.rate;
    if (mode === 'USERS' && rateObj.apply_vat) rate = rate * 1.13;
    return acc + (res.quantity * rate);
  }, 0);

  const fixedTotal = labourTotal + materialTotal + equipmentTotal;

  const subtotal = resources.reduce((acc, res) => {
    if (res.is_percentage) {
      let base = 0;
      if (res.percentage_base === 'TOTAL') base = fixedTotal;
      else if (res.percentage_base === 'LABOUR') base = labourTotal;
      else if (res.percentage_base === 'MATERIAL') base = materialTotal;
      else if (res.percentage_base === 'EQUIPMENT') base = equipmentTotal;
      else {
        const baseRes = allResources.find(r => r.name === res.percentage_base && !r.is_percentage);
        if (baseRes) {
          const rateObj = rates.find(r => r.name.toLowerCase() === baseRes.name.toLowerCase());
          if (rateObj) {
            let rate = rateObj.rate;
            if (mode === 'USERS' && rateObj.apply_vat) rate = rate * 1.13;
            base = baseRes.quantity * rate;
          }
        }
      }
      return acc + (res.quantity / 100 * base);
    }
    const rateObj = rates.find(r => r.name.toLowerCase() === res.name.toLowerCase());
    if (!rateObj) return acc;
    let rate = rateObj.rate;
    if (mode === 'USERS' && rateObj.apply_vat) rate = rate * 1.13;
    return acc + (res.quantity * rate);
  }, 0);

  if (resources.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between border-b border-black/5 pb-2">
        <h3 className={`text-xs font-bold uppercase tracking-widest text-${color}-600`}>{title}</h3>
        <span className="text-xs font-bold text-black/40">Subtotal: Rs. {subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left opacity-40">
            <th className="pb-2 font-medium">Description</th>
            <th className="pb-2 font-medium text-center">Quantity</th>
            <th className="pb-2 font-medium text-right">Unit Rate</th>
            <th className="pb-2 font-medium text-right">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-black/5">
          {resources.map((res, i) => {
            let amount = 0;
            let rateDisplay = '';

            if (res.is_percentage) {
              let base = 0;
              if (res.percentage_base === 'TOTAL') base = fixedTotal;
              else if (res.percentage_base === 'LABOUR') base = labourTotal;
              else if (res.percentage_base === 'MATERIAL') base = materialTotal;
              else if (res.percentage_base === 'EQUIPMENT') base = equipmentTotal;
              else {
                const baseRes = allResources.find(r => r.name === res.percentage_base && !r.is_percentage);
                if (baseRes) {
                  const rateObj = rates.find(r => r.name.toLowerCase() === baseRes.name.toLowerCase());
                  if (rateObj) {
                    let rate = rateObj.rate;
                    if (mode === 'USERS' && rateObj.apply_vat) rate = rate * 1.13;
                    base = baseRes.quantity * rate;
                  }
                }
              }
              amount = (res.quantity / 100) * base;
              rateDisplay = `${res.quantity}% of ${res.percentage_base}`;
            } else {
              const rateObj = rates.find(r => r.name.toLowerCase() === res.name.toLowerCase());
              let rate = rateObj?.rate || 0;
              if (mode === 'USERS' && rateObj?.apply_vat) {
                rate = rate * 1.13;
              }
              amount = res.quantity * rate;
              rateDisplay = rateObj ? rate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'Rate missing';
            }

            return (
              <tr key={i} className="group">
                <td className="py-2 font-medium">
                  {res.name}
                  {mode === 'USERS' && !res.is_percentage && !!rates.find(r => r.name.toLowerCase() === res.name.toLowerCase())?.apply_vat && (
                    <span className="text-[8px] ml-2 text-emerald-600 font-bold uppercase tracking-tighter">Incl. 13% VAT</span>
                  )}
                  {!!res.is_percentage && (
                    <span className="text-[8px] ml-2 text-blue-600 font-bold uppercase tracking-tighter">Percentage Based</span>
                  )}
                </td>
                <td className="py-2 text-center font-mono">
                  {res.is_percentage ? `${res.quantity}%` : res.quantity} 
                  <span className="text-[10px] opacity-40 ml-1">{res.unit || '-'}</span>
                </td>
                <td className="py-2 text-right font-mono text-black/40">{rateDisplay}</td>
                <td className="py-2 text-right font-mono font-bold">{amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
