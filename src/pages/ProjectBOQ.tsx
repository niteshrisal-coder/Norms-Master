import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  X,
  Edit2,
  Save,
  XCircle,
  Search,
  FileText,
  PieChart,
  TrendingUp,
  Truck
} from 'lucide-react';
import { ProjectDetail, Norm, Rate, BOQItem } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

// Type for project-specific overrides
interface RateOverride {
  norm_id: number;
  resource_name: string;
  override_rate: number | null;
  override_quantity: number | null;
}

// Types for Transportation
interface TransportSettings {
  transport_mode: 'TRUCK' | 'TRACTOR';
  metalled_distance: number;
  gravelled_distance: number;
  porter_distance: number;
  
  // Porter coefficients
  porter_easy: number;
  porter_difficult: number;
  porter_vdifficult: number;
  porter_high_volume: number;
  
  // Tractor road coefficients
  tractor_metalled: number;
  tractor_gravelled: number;
  
  // Truck road coefficients
  truck_metalled_easy: number;
  truck_metalled_difficult: number;
  truck_metalled_vdifficult: number;
  truck_metalled_high_volume: number;
  truck_gravelled_easy: number;
  truck_gravelled_difficult: number;
  truck_gravelled_vdifficult: number;
  truck_gravelled_high_volume: number;
}

interface MaterialTransport {
  material_name: string;
  unit_weight: number;
  load_category: 'EASY' | 'DIFFICULT' | 'VDIFFICULT' | 'HIGH_VOLUME';
}

interface TransportMaterialRow extends MaterialTransport {
  quantity: number; // Total quantity from BOQ
  metalled_cost_per_unit: number;
  gravelled_cost_per_unit: number;
  porter_cost_per_unit: number;
  total_cost_per_unit: number;
}

interface ResourceRow {
  name: string;
  type: string;
  unit: string;
  quantity: number;
  rate: number;
  apply_vat: boolean;
  amount: number;
  vatAmount: number;
  transportCost: number;
  totalAmount: number;
  isPercentage: boolean;
  percentageBase?: string;
}

export default function ProjectBOQ({ projectId, onBack }: { projectId: number, onBack: () => void }) {
  console.log('🔄 ProjectBOQ rendering, projectId:', projectId);
  
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [norms, setNorms] = useState<Norm[]>([]);
  const [rates, setRates] = useState<Rate[]>([]);
  const [overrides, setOverrides] = useState<RateOverride[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'BOQ' | 'RESOURCES' | 'ANALYSIS' | 'TRANSPORT'>('BOQ');
  const [newItem, setNewItem] = useState({ norm_id: 0, quantity: 0 });
  const [selectedAnalysisItem, setSelectedAnalysisItem] = useState<number | null>(null);
  
  // Transportation states
  const [transportSettings, setTransportSettings] = useState<TransportSettings | null>(null);
  const [materialTransport, setMaterialTransport] = useState<MaterialTransport[]>([]);
  const [transportMaterials, setTransportMaterials] = useState<TransportMaterialRow[]>([]);
  const [editingUnitWeight, setEditingUnitWeight] = useState<string | null>(null);
  const [tempUnitWeight, setTempUnitWeight] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Search states
  const [searchTerm, setSearchTerm] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);
  
  // Edit states for BOQ items
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ quantity: 0, norm_id: 0 });

  // Initial data fetch
  useEffect(() => {
    console.log('📡 Initial data fetch started');
    setIsLoading(true);
    setError(null);
    
    Promise.all([
      fetchProject(),
      fetchNormsAndRates(),
      fetchOverrides(),
      fetchTransportData()
    ]).catch(err => {
      console.error('❌ Error fetching initial data:', err);
      setError('Failed to load data. Please refresh the page.');
    }).finally(() => {
      setIsLoading(false);
      console.log('✅ Initial data fetch completed');
    });
  }, [projectId]);

  const fetchProject = async () => {
    console.log('📡 Fetching project:', projectId);
    const res = await fetch(`/api/projects/${projectId}`);
    if (!res.ok) throw new Error('Failed to fetch project');
    const data = await res.json();
    console.log('✅ Project loaded:', data.name);
    setProject(data);
    if (data.items.length > 0 && !selectedAnalysisItem) {
      setSelectedAnalysisItem(data.items[0].id);
    }
  };

  const fetchNormsAndRates = async () => {
    console.log('📡 Fetching norms and rates');
    const [nRes, rRes] = await Promise.all([
      fetch('/api/norms'),
      fetch('/api/rates')
    ]);
    if (!nRes.ok || !rRes.ok) throw new Error('Failed to fetch norms/rates');
    const normsData = await nRes.json();
    const ratesData = await rRes.json();
    console.log(`✅ Loaded ${normsData.length} norms, ${ratesData.length} rates`);
    setNorms(normsData);
    setRates(ratesData);
  };

  const fetchOverrides = async () => {
    console.log('📡 Fetching overrides for project:', projectId);
    const res = await fetch(`/api/projects/${projectId}/overrides`);
    if (!res.ok) throw new Error('Failed to fetch overrides');
    const data = await res.json();
    console.log(`✅ Loaded ${data.length} overrides`);
    setOverrides(data);
  };

  const fetchTransportData = async () => {
    console.log('📡 Fetching transport data for project:', projectId);
    try {
      // Fetch settings
      const settingsRes = await fetch(`/api/projects/${projectId}/transport/settings`);
      if (!settingsRes.ok) throw new Error('Failed to fetch transport settings');
      const settings = await settingsRes.json();
      console.log('✅ Transport settings loaded:', settings.transport_mode);
      setTransportSettings(settings);

      // Fetch material transport data
      const materialsRes = await fetch(`/api/projects/${projectId}/transport/materials`);
      if (!materialsRes.ok) throw new Error('Failed to fetch material transport');
      const materials = await materialsRes.json();
      console.log(`✅ Loaded ${materials.length} material transport entries`);
      setMaterialTransport(materials);
    } catch (error) {
      console.error('Error fetching transport data:', error);
      // Don't throw, just log error
    }
  };

  // Get override value for a resource - memoized
  const getOverride = useCallback((normId: number, resourceName: string) => {
    return overrides.find(o => o.norm_id === normId && o.resource_name === resourceName);
  }, [overrides]);

  // Calculate rate with project-specific overrides - memoized
  const calculateItemRate = useCallback((normId: number, useOverrides: boolean = true) => {
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
        // Check for project-specific override
        const override = useOverrides ? getOverride(normId, res.name) : null;
        
        // Use override rate if available, otherwise global rate
        let rate = override?.override_rate ?? rates.find(r => r.name.toLowerCase() === res.name.toLowerCase())?.rate ?? 0;
        
        // Use override quantity if available, otherwise norm quantity
        const quantity = override?.override_quantity ?? res.quantity;
        
        if (project.mode === 'USERS') {
          const rateObj = rates.find(r => r.name.toLowerCase() === res.name.toLowerCase());
          if (rateObj?.apply_vat) rate = rate * 1.13;
        }
        
        const amount = quantity * rate;
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
          const override = useOverrides ? getOverride(normId, baseRes.name) : null;
          let rate = override?.override_rate ?? rates.find(r => r.name.toLowerCase() === baseRes.name.toLowerCase())?.rate ?? 0;
          const quantity = override?.override_quantity ?? baseRes.quantity;
          if (project.mode === 'USERS') {
            const rateObj = rates.find(r => r.name.toLowerCase() === baseRes.name.toLowerCase());
            if (rateObj?.apply_vat) rate = rate * 1.13;
          }
          base = quantity * rate;
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
  }, [norms, project, rates, getOverride]);

  const calculateTotalBOQ = useCallback(() => {
    if (!project) return 0;
    
    // For USERS mode: BOQ total should equal total resource amount with VAT
    if (project.mode === 'USERS') {
      const resources = getResourceBreakdown();
      return resources.reduce((acc, r) => acc + r.totalAmount, 0);
    }
    
    // For CONTRACTOR mode: BOQ total = resource total + 15% overhead
    const resources = getResourceBreakdown();
    const resourceTotal = resources.reduce((acc, r) => acc + r.totalAmount, 0);
    return resourceTotal * 1.15;
  }, [project]);

  // Memoized resource breakdown with transport costs
  const resourceBreakdown = useMemo((): ResourceRow[] => {
    if (!project) return [];
    console.log('🧮 Calculating resource breakdown with transport');
    
    const breakdown: Record<string, ResourceRow> = {};
    
    // First pass: calculate all non-percentage resources
    project.items.forEach(item => {
      const norm = norms.find(n => n.id === item.norm_id);
      if (!norm) return;
      const basis = norm.basis_quantity || 1;
      
      norm.resources.forEach(res => {
        if (!res.is_percentage) {
          const key = `${res.resource_type}-${res.name}`;
          const override = getOverride(item.norm_id, res.name);
          const rateObj = rates.find(r => r.name.toLowerCase() === res.name.toLowerCase());
          
          let rate = override?.override_rate ?? rateObj?.rate ?? 0;
          const quantity = override?.override_quantity ?? res.quantity;
          const applyVat = rateObj?.apply_vat || false;
          
          if (!breakdown[key]) {
            breakdown[key] = {
              name: res.name,
              type: res.resource_type,
              unit: res.unit || rateObj?.unit || '-',
              quantity: 0,
              rate: rate,
              apply_vat: applyVat,
              amount: 0,
              vatAmount: 0,
              transportCost: 0,
              totalAmount: 0,
              isPercentage: false
            };
          }
          
          breakdown[key].quantity += (quantity / basis) * item.quantity;
        }
      });
    });
    
    // Calculate amounts for non-percentage resources
    Object.values(breakdown).forEach(item => {
      item.amount = item.quantity * item.rate;
      item.vatAmount = item.apply_vat ? item.amount * 0.13 : 0;
      
      // Add transport cost for materials
      if (item.type === 'Material') {
        const transportMaterial = transportMaterials.find(tm => tm.material_name === item.name);
        if (transportMaterial) {
          item.transportCost = transportMaterial.total_cost_per_unit * item.quantity;
        }
      }
      
      item.totalAmount = item.amount + item.vatAmount + item.transportCost;
    });
    
    // Second pass: calculate percentage resources and add them as separate rows
    project.items.forEach(item => {
      const norm = norms.find(n => n.id === item.norm_id);
      if (!norm) return;
      const basis = norm.basis_quantity || 1;
      
      // Calculate totals for this norm to use for percentage bases
      let labourTotal = 0, materialTotal = 0, equipmentTotal = 0;
      
      norm.resources.forEach(res => {
        if (!res.is_percentage) {
          const override = getOverride(item.norm_id, res.name);
          let rate = override?.override_rate ?? rates.find(r => r.name.toLowerCase() === res.name.toLowerCase())?.rate ?? 0;
          const quantity = override?.override_quantity ?? res.quantity;
          const rateObj = rates.find(r => r.name.toLowerCase() === res.name.toLowerCase());
          
          if (project.mode === 'USERS' && rateObj?.apply_vat) rate = rate * 1.13;
          
          const amount = (quantity / basis) * item.quantity * rate;
          if (res.resource_type === 'Labour') labourTotal += amount;
          else if (res.resource_type === 'Material') materialTotal += amount;
          else if (res.resource_type === 'Equipment') equipmentTotal += amount;
        }
      });
      
      const fixedTotal = labourTotal + materialTotal + equipmentTotal;
      
      // Now process percentage resources
      norm.resources.forEach(res => {
        if (res.is_percentage) {
          const key = `percentage-${res.name}-${item.id}`;
          let base = 0;
          
          if (res.percentage_base === 'TOTAL') base = fixedTotal;
          else if (res.percentage_base === 'LABOUR') base = labourTotal;
          else if (res.percentage_base === 'MATERIAL') base = materialTotal;
          else if (res.percentage_base === 'EQUIPMENT') base = equipmentTotal;
          else {
            // Find the base resource
            const baseRes = norm.resources.find(r => r.name === res.percentage_base && !r.is_percentage);
            if (baseRes) {
              const override = getOverride(item.norm_id, baseRes.name);
              let rate = override?.override_rate ?? rates.find(r => r.name.toLowerCase() === baseRes.name.toLowerCase())?.rate ?? 0;
              const quantity = override?.override_quantity ?? baseRes.quantity;
              if (project.mode === 'USERS') {
                const rateObj = rates.find(r => r.name.toLowerCase() === baseRes.name.toLowerCase());
                if (rateObj?.apply_vat) rate = rate * 1.13;
              }
              base = (quantity / basis) * item.quantity * rate;
            }
          }
          
          const amount = (res.quantity / 100) * base;
          
          // Add percentage resource as a separate row
          breakdown[key] = {
            name: `${res.name} (${res.quantity}% of ${res.percentage_base})`,
            type: 'Percentage',
            unit: 'Rs.',
            quantity: 1,
            rate: amount,
            apply_vat: false,
            amount: amount,
            vatAmount: 0,
            transportCost: 0,
            totalAmount: amount,
            isPercentage: true,
            percentageBase: res.percentage_base
          };
        }
      });
    });
    
    return Object.values(breakdown).sort((a, b) => {
      if (a.type === 'Percentage' && b.type !== 'Percentage') return 1;
      if (a.type !== 'Percentage' && b.type === 'Percentage') return -1;
      return a.type.localeCompare(b.type);
    });
  }, [project, norms, rates, getOverride, transportMaterials]);

  const getResourceBreakdown = useCallback(() => {
    return resourceBreakdown;
  }, [resourceBreakdown]);

  // Get all materials with their quantities for transportation - memoized
  const getMaterialsForTransport = useCallback((): TransportMaterialRow[] => {
    if (!project || !transportSettings) return [];
    console.log('🧮 Calculating materials for transport');
    
    const resourceBreakdown = getResourceBreakdown();
    const materialRows = resourceBreakdown.filter(r => r.type === 'Material');
    
    // Group by material name and sum quantities
    const materialMap = new Map<string, { quantity: number, unit: string }>();
    
    materialRows.forEach(row => {
      const key = row.name;
      if (materialMap.has(key)) {
        materialMap.get(key)!.quantity += row.quantity;
      } else {
        materialMap.set(key, { quantity: row.quantity, unit: row.unit });
      }
    });
    
    // Convert to array and add transport data
    const materials: TransportMaterialRow[] = Array.from(materialMap.entries()).map(([name, data]) => {
      const saved = materialTransport.find(m => m.material_name === name);
      
      return {
        material_name: name,
        unit_weight: saved?.unit_weight || 0,
        load_category: saved?.load_category || 'EASY',
        quantity: data.quantity,
        metalled_cost_per_unit: 0,
        gravelled_cost_per_unit: 0,
        porter_cost_per_unit: 0,
        total_cost_per_unit: 0
      };
    });
    
    // Calculate transportation costs per unit
    return calculateTransportCostsPerUnit(materials);
  }, [project, transportSettings, getResourceBreakdown, materialTransport]);

  const calculateTransportCostsPerUnit = useCallback((materials: TransportMaterialRow[]): TransportMaterialRow[] => {
    if (!transportSettings) return materials;
    console.log('🧮 Calculating transport costs per unit');
    
    const KOSH_CONVERSION = 3.218; // 1 kosh = 3.218 km
    
    return materials.map(material => {
      const category = material.load_category;
      const weightPerUnit = material.unit_weight; // kg per unit
      
      // Get coefficients based on mode
      let metalledCoeff = 0;
      let gravelledCoeff = 0;
      let porterCoeff = 0;
      
      if (transportSettings.transport_mode === 'TRACTOR') {
        // Tractor mode: road coefficients are per kg per km (no kosh conversion)
        metalledCoeff = transportSettings.tractor_metalled;
        gravelledCoeff = transportSettings.tractor_gravelled;
        
        // Porter coefficient based on category (per kg per kosh)
        switch (category) {
          case 'EASY': porterCoeff = transportSettings.porter_easy; break;
          case 'DIFFICULT': porterCoeff = transportSettings.porter_difficult; break;
          case 'VDIFFICULT': porterCoeff = transportSettings.porter_vdifficult; break;
          case 'HIGH_VOLUME': porterCoeff = transportSettings.porter_high_volume; break;
        }
        
        // Calculate costs per unit
        const metalledCostPerUnit = transportSettings.metalled_distance * metalledCoeff * weightPerUnit;
        const gravelledCostPerUnit = transportSettings.gravelled_distance * gravelledCoeff * weightPerUnit;
        const porterCostPerUnit = (transportSettings.porter_distance / KOSH_CONVERSION) * porterCoeff * weightPerUnit;
        
        return {
          ...material,
          metalled_cost_per_unit: metalledCostPerUnit,
          gravelled_cost_per_unit: gravelledCostPerUnit,
          porter_cost_per_unit: porterCostPerUnit,
          total_cost_per_unit: metalledCostPerUnit + gravelledCostPerUnit + porterCostPerUnit
        };
      } else {
        // Truck mode: all coefficients are per kg per kosh
        // Road coefficients based on category
        switch (category) {
          case 'EASY':
            metalledCoeff = transportSettings.truck_metalled_easy;
            gravelledCoeff = transportSettings.truck_gravelled_easy;
            break;
          case 'DIFFICULT':
            metalledCoeff = transportSettings.truck_metalled_difficult;
            gravelledCoeff = transportSettings.truck_gravelled_difficult;
            break;
          case 'VDIFFICULT':
            metalledCoeff = transportSettings.truck_metalled_vdifficult;
            gravelledCoeff = transportSettings.truck_gravelled_vdifficult;
            break;
          case 'HIGH_VOLUME':
            metalledCoeff = transportSettings.truck_metalled_high_volume;
            gravelledCoeff = transportSettings.truck_gravelled_high_volume;
            break;
        }
        
        // Porter coefficient based on category
        switch (category) {
          case 'EASY': porterCoeff = transportSettings.porter_easy; break;
          case 'DIFFICULT': porterCoeff = transportSettings.porter_difficult; break;
          case 'VDIFFICULT': porterCoeff = transportSettings.porter_vdifficult; break;
          case 'HIGH_VOLUME': porterCoeff = transportSettings.porter_high_volume; break;
        }
        
        // Calculate costs per unit (all distances need kosh conversion)
        const metalledCostPerUnit = (transportSettings.metalled_distance / KOSH_CONVERSION) * metalledCoeff * weightPerUnit;
        const gravelledCostPerUnit = (transportSettings.gravelled_distance / KOSH_CONVERSION) * gravelledCoeff * weightPerUnit;
        const porterCostPerUnit = (transportSettings.porter_distance / KOSH_CONVERSION) * porterCoeff * weightPerUnit;
        
        return {
          ...material,
          metalled_cost_per_unit: metalledCostPerUnit,
          gravelled_cost_per_unit: gravelledCostPerUnit,
          porter_cost_per_unit: porterCostPerUnit,
          total_cost_per_unit: metalledCostPerUnit + gravelledCostPerUnit + porterCostPerUnit
        };
      }
    });
  }, [transportSettings]);

  // Update transport materials when dependencies change - but only when in TRANSPORT mode
  useEffect(() => {
    if (viewMode === 'TRANSPORT' && transportSettings && project) {
      console.log('🔄 Updating transport materials');
      const materials = getMaterialsForTransport();
      setTransportMaterials(materials);
    }
  }, [viewMode, transportSettings, materialTransport, project, getMaterialsForTransport]);

  // Save material transport data
  const saveMaterialTransport = async () => {
    console.log('💾 Saving material transport data');
    const materials = transportMaterials.map(m => ({
      material_name: m.material_name,
      unit_weight: m.unit_weight,
      load_category: m.load_category
    }));
    
    await fetch(`/api/projects/${projectId}/transport/materials/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ materials })
    });
    
    fetchTransportData();
  };

  // Update unit weight for a material
  const updateUnitWeight = (materialName: string, unitWeight: number) => {
    setTransportMaterials(prev => {
      const updated = prev.map(m => 
        m.material_name === materialName 
          ? { ...m, unit_weight: unitWeight }
          : m
      );
      return calculateTransportCostsPerUnit(updated);
    });
  };

  // Update load category for a material
  const updateLoadCategory = (materialName: string, category: 'EASY' | 'DIFFICULT' | 'VDIFFICULT' | 'HIGH_VOLUME') => {
    setTransportMaterials(prev => {
      const updated = prev.map(m => 
        m.material_name === materialName 
          ? { ...m, load_category: category }
          : m
      );
      return calculateTransportCostsPerUnit(updated);
    });
  };

  // Update transport setting
  const updateTransportSetting = (key: keyof TransportSettings, value: any) => {
    if (!transportSettings) return;
    
    const updated = { ...transportSettings, [key]: value };
    setTransportSettings(updated);
    
    // Only recalculate if in TRANSPORT mode
    if (viewMode === 'TRANSPORT') {
      setTransportMaterials(prev => calculateTransportCostsPerUnit(prev));
    }
  };

  // Save all transport settings
  const saveTransportSettings = async () => {
    if (!transportSettings) return;
    console.log('💾 Saving transport settings');
    
    await fetch(`/api/projects/${projectId}/transport/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(transportSettings)
    });
    
    // Save material data
    await saveMaterialTransport();
  };

  // Filtered norms for search
  const filteredNorms = useMemo(() => {
    return norms.filter(norm => 
      norm.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      norm.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
      norm.ref_ss?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [norms, searchTerm]);

  const handleAddItem = async () => {
    if (!newItem.norm_id || newItem.quantity <= 0) return;
    console.log('➕ Adding BOQ item');
    await fetch(`/api/projects/${projectId}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newItem)
    });
    setNewItem({ norm_id: 0, quantity: 0 });
    setSearchTerm('');
    setShowSearchResults(false);
    setIsAddModalOpen(false);
    fetchProject();
  };

  const handleDeleteItem = async (id: number) => {
    if (window.confirm('Are you sure you want to delete this item?')) {
      console.log('🗑️ Deleting BOQ item:', id);
      await fetch(`/api/boq-items/${id}`, { method: 'DELETE' });
      fetchProject();
    }
  };

  // Start editing an item
  const handleEditItem = (item: any) => {
    setEditingItemId(item.id);
    setEditForm({ quantity: item.quantity, norm_id: item.norm_id });
  };

  // Save edited item
  const handleSaveEdit = async (id: number) => {
    console.log('💾 Saving BOQ item edit:', id);
    await fetch(`/api/boq-items/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity: editForm.quantity })
    });
    setEditingItemId(null);
    fetchProject();
  };

  // Cancel edit
  const handleCancelEdit = () => {
    setEditingItemId(null);
  };

  // Save rate override
  const handleSaveOverride = async (normId: number, resourceName: string, overrideRate: number | null, overrideQuantity: number | null) => {
    console.log('💾 Saving override:', { normId, resourceName });
    await fetch(`/api/projects/${projectId}/overrides`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ norm_id: normId, resource_name: resourceName, override_rate: overrideRate, override_quantity: overrideQuantity })
    });
    fetchOverrides();
  };

  // ========== EXPORT FUNCTIONS ==========

  // Format number to 2 decimal places
  const formatNumber = (num: number): number => {
    return Math.trunc(num * 100) / 100;
  };

  // Export BOQ
  const exportBOQ = async () => {
    if (!project) return;
    console.log('📤 Exporting BOQ');
    
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('BOQ');

    // Add title
    sheet.mergeCells('A1:G1');
    const titleRow = sheet.getCell('A1');
    titleRow.value = `Bill of Quantities - ${project.name} (${project.mode} Mode)`;
    titleRow.font = { size: 16, bold: true };
    titleRow.alignment = { horizontal: 'center', vertical: 'middle' };
    titleRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
    titleRow.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    
    sheet.addRow([]);

    // Set column widths
    sheet.columns = [
      { header: 'S.N.', key: 'sn', width: 8 },
      { header: 'Description of Work Item', key: 'desc', width: 50 },
      { header: 'Unit', key: 'unit', width: 10 },
      { header: 'Quantity', key: 'qty', width: 15 },
      { header: 'Rate (Rs.)', key: 'rate', width: 15 },
      { header: 'Total Amount (Rs.)', key: 'total', width: 20 },
      { header: 'Ref to SS', key: 'ref', width: 15 }
    ];

    // Style headers
    const headerRow = sheet.getRow(3);
    headerRow.height = 30;
    headerRow.eachCell(cell => {
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });

    // Add data
    let rowIndex = 4;
    project.items.forEach((item, idx) => {
      const rate = formatNumber(calculateItemRate(item.norm_id));
      const total = formatNumber(rate * item.quantity);
      const row = sheet.getRow(rowIndex);
      row.height = 25;
      
      row.getCell(1).value = idx + 1;
      row.getCell(2).value = item.description;
      row.getCell(3).value = item.unit;
      row.getCell(4).value = item.quantity;
      row.getCell(5).value = rate;
      row.getCell(6).value = total;
      row.getCell(7).value = item.ref_ss || '-';
      
      // Apply borders and formatting
      for (let i = 1; i <= 7; i++) {
        const cell = row.getCell(i);
        cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
        cell.alignment = { 
          horizontal: i === 2 ? 'left' : 'right', 
          vertical: 'middle',
          wrapText: i === 2 ? true : false 
        };
        if (i >= 4) {
          cell.numFmt = '#,##0.00';
        }
      }
      
      // Alternate row color
      if (rowIndex % 2 === 0) {
        for (let i = 1; i <= 7; i++) {
          row.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9F9F9' } };
        }
      }
      
      rowIndex++;
    });

    // Add total row
    sheet.addRow([]);
    const totalRow = sheet.getRow(rowIndex + 1);
    totalRow.height = 30;
    totalRow.getCell(5).value = 'TOTAL:';
    totalRow.getCell(5).font = { bold: true };
    totalRow.getCell(5).alignment = { horizontal: 'right', vertical: 'middle' };
    totalRow.getCell(6).value = formatNumber(calculateTotalBOQ());
    totalRow.getCell(6).font = { bold: true };
    totalRow.getCell(6).numFmt = '#,##0.00';
    totalRow.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } };
    
    for (let i = 5; i <= 6; i++) {
      totalRow.getCell(i).border = { top: { style: 'double' }, bottom: { style: 'double' }, left: { style: 'thin' }, right: { style: 'thin' } };
    }

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `${project.name}_BOQ.xlsx`);
  };

  // Export Resource Breakdown with VAT and Transport
  const exportResources = async () => {
    if (!project) return;
    console.log('📤 Exporting Resources');
    
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Resource Breakdown');

    // Add title
    sheet.mergeCells('A1:I1');
    const titleRow = sheet.getCell('A1');
    titleRow.value = `Resource Breakdown - ${project.name} (${project.mode} Mode)`;
    titleRow.font = { size: 16, bold: true };
    titleRow.alignment = { horizontal: 'center', vertical: 'middle' };
    titleRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
    titleRow.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    
    sheet.addRow([]);

    // Set column widths
    sheet.columns = [
      { header: 'Type', key: 'type', width: 15 },
      { header: 'Resource Name', key: 'name', width: 40 },
      { header: 'Unit', key: 'unit', width: 10 },
      { header: 'Quantity', key: 'qty', width: 15 },
      { header: 'Unit Rate (Rs.)', key: 'rate', width: 18 },
      { header: 'Amount (Rs.)', key: 'amount', width: 18 },
      { header: 'VAT (13%)', key: 'vat', width: 15 },
      { header: 'Transport (Rs.)', key: 'transport', width: 18 },
      { header: 'Total Amount (Rs.)', key: 'totalAmount', width: 20 }
    ];

    // Style headers
    const headerRow = sheet.getRow(3);
    headerRow.height = 30;
    headerRow.eachCell(cell => {
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });

    const resources = getResourceBreakdown();
    let rowIndex = 4;
    
    resources.forEach(res => {
      const row = sheet.getRow(rowIndex);
      row.height = 25;
      
      row.getCell(1).value = res.type;
      row.getCell(2).value = res.name;
      row.getCell(3).value = res.unit;
      row.getCell(4).value = formatNumber(res.quantity);
      row.getCell(5).value = formatNumber(res.rate);
      row.getCell(6).value = formatNumber(res.amount);
      row.getCell(7).value = formatNumber(res.vatAmount);
      row.getCell(8).value = formatNumber(res.transportCost);
      row.getCell(9).value = formatNumber(res.totalAmount);
      
      // Apply borders to all cells in row
      for (let i = 1; i <= 9; i++) {
        const cell = row.getCell(i);
        cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
        cell.alignment = { 
          horizontal: i === 2 ? 'left' : 'right', 
          vertical: 'middle',
          wrapText: i === 2 ? true : false 
        };
        
        // Format numbers
        if (i >= 4) {
          cell.numFmt = '#,##0.00';
        }
      }
      
      // Alternate row color
      if (rowIndex % 2 === 0) {
        for (let i = 1; i <= 9; i++) {
          row.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9F9F9' } };
        }
      }
      
      rowIndex++;
    });

    // Add total row
    const totalAmount = resources.reduce((acc, r) => acc + r.amount, 0);
    const totalVAT = resources.reduce((acc, r) => acc + r.vatAmount, 0);
    const totalTransport = resources.reduce((acc, r) => acc + r.transportCost, 0);
    const totalAll = resources.reduce((acc, r) => acc + r.totalAmount, 0);
    
    sheet.addRow([]);
    const totalRow = sheet.getRow(rowIndex + 1);
    totalRow.height = 30;
    
    totalRow.getCell(5).value = 'TOTAL:';
    totalRow.getCell(5).font = { bold: true };
    totalRow.getCell(5).alignment = { horizontal: 'right', vertical: 'middle' };
    
    totalRow.getCell(6).value = formatNumber(totalAmount);
    totalRow.getCell(6).font = { bold: true };
    totalRow.getCell(6).numFmt = '#,##0.00';
    
    totalRow.getCell(7).value = formatNumber(totalVAT);
    totalRow.getCell(7).font = { bold: true };
    totalRow.getCell(7).numFmt = '#,##0.00';
    
    totalRow.getCell(8).value = formatNumber(totalTransport);
    totalRow.getCell(8).font = { bold: true };
    totalRow.getCell(8).numFmt = '#,##0.00';
    
    totalRow.getCell(9).value = formatNumber(totalAll);
    totalRow.getCell(9).font = { bold: true };
    totalRow.getCell(9).numFmt = '#,##0.00';
    totalRow.getCell(9).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } };
    
    // Apply borders to total row
    for (let i = 5; i <= 9; i++) {
      totalRow.getCell(i).border = { top: { style: 'double' }, bottom: { style: 'double' }, left: { style: 'thin' }, right: { style: 'thin' } };
    }

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `${project.name}_Resource_Breakdown.xlsx`);
  };

  // Export Detailed Rate Analysis
  const exportRateAnalysis = async () => {
    if (!project || !norms.length) return;
    console.log('📤 Exporting Rate Analysis');
    
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Rate Analysis');

    // Add title
    sheet.mergeCells('A1:G1');
    const titleRow = sheet.getCell('A1');
    titleRow.value = `Detailed Rate Analysis - ${project.name} (${project.mode} Mode)`;
    titleRow.font = { size: 16, bold: true };
    titleRow.alignment = { horizontal: 'center', vertical: 'middle' };
    titleRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
    titleRow.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    
    let currentRow = 3;

    // Loop through each BOQ item
    for (let i = 0; i < project.items.length; i++) {
      const item = project.items[i];
      const norm = norms.find(n => n.id === item.norm_id);
      if (!norm) continue;

      // Item header
      sheet.mergeCells(`A${currentRow}:G${currentRow}`);
      const itemHeader = sheet.getCell(`A${currentRow}`);
      itemHeader.value = `${i + 1}. ${item.description} (Ref: ${item.ref_ss || '-'})`;
      itemHeader.font = { bold: true, size: 12 };
      itemHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
      itemHeader.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
      itemHeader.alignment = { vertical: 'middle', wrapText: true };
      currentRow++;

      // Sub-header
      const headers = ['Resource Type', 'Resource Name', 'Unit', 'Quantity', 'Rate (Rs.)', 'VAT', 'Amount (Rs.)'];
      const headerRow = sheet.getRow(currentRow);
      headerRow.height = 25;
      headers.forEach((header, idx) => {
        const cell = headerRow.getCell(idx + 1);
        cell.value = header;
        cell.font = { bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
        cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      });
      currentRow++;

      // Calculate totals for percentages
      let labourTotal = 0, materialTotal = 0, equipmentTotal = 0;
      
      norm.resources.forEach(res => {
        if (!res.is_percentage) {
          const override = getOverride(item.norm_id, res.name);
          let rate = override?.override_rate ?? rates.find(r => r.name.toLowerCase() === res.name.toLowerCase())?.rate ?? 0;
          const quantity = override?.override_quantity ?? res.quantity;
          const rateObj = rates.find(r => r.name.toLowerCase() === res.name.toLowerCase());
          
          if (project.mode === 'USERS' && rateObj?.apply_vat) rate = rate * 1.13;
          
          const amount = quantity * rate;
          if (res.resource_type === 'Labour') labourTotal += amount;
          else if (res.resource_type === 'Material') materialTotal += amount;
          else if (res.resource_type === 'Equipment') equipmentTotal += amount;
        }
      });

      const fixedTotal = labourTotal + materialTotal + equipmentTotal;

      // Add resources
      norm.resources.forEach(res => {
        const row = sheet.getRow(currentRow);
        row.height = 25;
        
        const override = getOverride(item.norm_id, res.name);
        const rateObj = rates.find(r => r.name.toLowerCase() === res.name.toLowerCase());
        let rate = override?.override_rate ?? rateObj?.rate ?? 0;
        const quantity = override?.override_quantity ?? res.quantity;
        const applyVat = rateObj?.apply_vat || false;
        let amount = 0;

        if (res.is_percentage) {
          let base = 0;
          if (res.percentage_base === 'TOTAL') base = fixedTotal;
          else if (res.percentage_base === 'LABOUR') base = labourTotal;
          else if (res.percentage_base === 'MATERIAL') base = materialTotal;
          else if (res.percentage_base === 'EQUIPMENT') base = equipmentTotal;
          else {
            const baseRes = norm.resources.find(r => r.name === res.percentage_base && !r.is_percentage);
            if (baseRes) {
              const baseOverride = getOverride(item.norm_id, baseRes.name);
              const baseRateObj = rates.find(r => r.name.toLowerCase() === baseRes.name.toLowerCase());
              let baseRate = baseOverride?.override_rate ?? baseRateObj?.rate ?? 0;
              const baseQty = baseOverride?.override_quantity ?? baseRes.quantity;
              if (project.mode === 'USERS' && baseRateObj?.apply_vat) baseRate = baseRate * 1.13;
              base = baseQty * baseRate;
            }
          }
          amount = (res.quantity / 100) * base;
          
          row.getCell(1).value = res.resource_type;
          row.getCell(2).value = `${res.name} (${res.quantity}% of ${res.percentage_base})`;
          row.getCell(3).value = '-';
          row.getCell(4).value = '-';
          row.getCell(5).value = '-';
          row.getCell(6).value = '-';
          row.getCell(7).value = formatNumber(amount);
        } else {
          if (project.mode === 'USERS' && applyVat) rate = rate * 1.13;
          amount = quantity * rate;
          
          row.getCell(1).value = res.resource_type;
          row.getCell(2).value = res.name;
          row.getCell(3).value = res.unit || '-';
          row.getCell(4).value = quantity;
          row.getCell(5).value = formatNumber(rate);
          row.getCell(6).value = applyVat ? '13%' : '-';
          row.getCell(7).value = formatNumber(amount);
        }
        
        // Apply borders and formatting
        for (let j = 1; j <= 7; j++) {
          const cell = row.getCell(j);
          cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
          cell.alignment = { 
            horizontal: j === 2 ? 'left' : 'right', 
            vertical: 'middle',
            wrapText: j === 2 ? true : false 
          };
          if (j >= 4 && j <= 7 && !res.is_percentage) {
            cell.numFmt = '#,##0.00';
          }
        }
        
        // Alternate row color
        if (currentRow % 2 === 0) {
          for (let j = 1; j <= 7; j++) {
            row.getCell(j).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9F9F9' } };
          }
        }
        
        currentRow++;
      });

      // Item unit rate (not subtotal)
      const itemRate = formatNumber(calculateItemRate(item.norm_id));
      
      sheet.addRow([]);
      const unitRateRow = sheet.getRow(currentRow + 1);
      unitRateRow.height = 25;
      unitRateRow.getCell(5).value = 'Unit Rate:';
      unitRateRow.getCell(5).font = { bold: true };
      unitRateRow.getCell(5).alignment = { horizontal: 'right', vertical: 'middle' };
      unitRateRow.getCell(7).value = itemRate;
      unitRateRow.getCell(7).font = { bold: true };
      unitRateRow.getCell(7).numFmt = '#,##0.00';
      unitRateRow.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
      
      currentRow += 3;
    }

    // Grand total
    sheet.addRow([]);
    const grandTotalRow = sheet.getRow(currentRow + 2);
    grandTotalRow.height = 30;
    grandTotalRow.getCell(6).value = 'GRAND TOTAL:';
    grandTotalRow.getCell(6).font = { bold: true, size: 12 };
    grandTotalRow.getCell(6).alignment = { horizontal: 'right', vertical: 'middle' };
    grandTotalRow.getCell(7).value = formatNumber(calculateTotalBOQ());
    grandTotalRow.getCell(7).font = { bold: true, size: 12 };
    grandTotalRow.getCell(7).numFmt = '#,##0.00';
    grandTotalRow.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } };
    
    for (let i = 6; i <= 7; i++) {
      grandTotalRow.getCell(i).border = { top: { style: 'double' }, bottom: { style: 'double' }, left: { style: 'thin' }, right: { style: 'thin' } };
    }

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `${project.name}_Detailed_Rate_Analysis.xlsx`);
  };

  // Export Transportation Calculation
  const exportTransportation = async () => {
    if (!project || !transportMaterials.length) return;
    console.log('📤 Exporting Transportation');
    
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Transportation');

    // Add title
    sheet.mergeCells('A1:G1');
    const titleRow = sheet.getCell('A1');
    titleRow.value = `Transportation Calculation - ${project.name} (${transportSettings?.transport_mode} Mode)`;
    titleRow.font = { size: 16, bold: true };
    titleRow.alignment = { horizontal: 'center', vertical: 'middle' };
    titleRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
    titleRow.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    
    sheet.addRow([]);
    sheet.addRow([`Metalled Distance: ${transportSettings?.metalled_distance} km`]);
    sheet.addRow([`Gravelled Distance: ${transportSettings?.gravelled_distance} km`]);
    sheet.addRow([`Porter Distance: ${transportSettings?.porter_distance} km`]);
    sheet.addRow([]);

    // Set column widths
    sheet.columns = [
      { header: 'Material', key: 'material', width: 30 },
      { header: 'Unit Weight (kg)', key: 'unitWeight', width: 15 },
      { header: 'Category', key: 'category', width: 15 },
      { header: 'Metalled (Rs./unit)', key: 'metalled', width: 18 },
      { header: 'Gravelled (Rs./unit)', key: 'gravelled', width: 18 },
      { header: 'Porter (Rs./unit)', key: 'porter', width: 18 },
      { header: 'Total (Rs./unit)', key: 'total', width: 18 }
    ];

    // Style headers
    const headerRow = sheet.getRow(7);
    headerRow.height = 30;
    headerRow.eachCell(cell => {
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });

    // Add data
    let rowIndex = 8;
    transportMaterials.forEach(material => {
      const row = sheet.getRow(rowIndex);
      row.height = 25;
      
      row.getCell(1).value = material.material_name;
      row.getCell(2).value = material.unit_weight;
      row.getCell(3).value = material.load_category;
      row.getCell(4).value = formatNumber(material.metalled_cost_per_unit);
      row.getCell(5).value = formatNumber(material.gravelled_cost_per_unit);
      row.getCell(6).value = formatNumber(material.porter_cost_per_unit);
      row.getCell(7).value = formatNumber(material.total_cost_per_unit);
      
      for (let i = 1; i <= 7; i++) {
        const cell = row.getCell(i);
        cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
        cell.alignment = { 
          horizontal: i === 1 ? 'left' : 'right', 
          vertical: 'middle',
          wrapText: i === 1 ? true : false 
        };
        if (i >= 2) {
          cell.numFmt = '#,##0.00';
        }
      }
      
      rowIndex++;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `${project.name}_Transportation.xlsx`);
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black mx-auto mb-4"></div>
          <p className="text-black/40">Loading project data...</p>
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-red-600 font-bold mb-2">Error Loading Data</p>
          <p className="text-black/40 mb-4">{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-[#141414] text-white rounded-2xl font-bold"
          >
            Refresh Page
          </button>
        </div>
      </div>
    );
  }

  if (!project) return <div className="p-8 text-center">Loading project...</div>;

  const resources = resourceBreakdown;
  const totalResourcesAmount = resources.reduce((acc, r) => acc + r.totalAmount, 0);

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
          {viewMode === 'BOQ' && (
            <button 
              onClick={exportBOQ}
              className="bg-white text-black px-6 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-black/5 transition-all border border-black/5"
            >
              <FileText size={18} />
              Export BOQ
            </button>
          )}
          {viewMode === 'RESOURCES' && (
            <button 
              onClick={exportResources}
              className="bg-white text-black px-6 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-black/5 transition-all border border-black/5"
            >
              <PieChart size={18} />
              Export Resources
            </button>
          )}
          {viewMode === 'ANALYSIS' && (
            <button 
              onClick={exportRateAnalysis}
              className="bg-white text-black px-6 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-black/5 transition-all border border-black/5"
            >
              <TrendingUp size={18} />
              Export Rate Analysis
            </button>
          )}
          {viewMode === 'TRANSPORT' && (
            <button 
              onClick={exportTransportation}
              className="bg-white text-black px-6 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-black/5 transition-all border border-black/5"
            >
              <Truck size={18} />
              Export Transport
            </button>
          )}
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
          <p className="text-3xl font-bold tracking-tighter">Rs. {formatNumber(calculateTotalBOQ()).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-black/5 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-black/40 mb-1">Total Resource Cost</p>
          <p className="text-3xl font-bold tracking-tighter">Rs. {formatNumber(totalResourcesAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-[#F5F5F0] p-1 rounded-2xl flex border border-black/5 shadow-sm">
          <button 
            onClick={() => setViewMode('BOQ')}
            className={`flex-1 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${viewMode === 'BOQ' ? 'bg-[#141414] text-white shadow-lg' : 'text-black/40 hover:text-black/60'}`}
          >
            BOQ
          </button>
          <button 
            onClick={() => setViewMode('RESOURCES')}
            className={`flex-1 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${viewMode === 'RESOURCES' ? 'bg-[#141414] text-white shadow-lg' : 'text-black/40 hover:text-black/60'}`}
          >
            Resources
          </button>
          <button 
            onClick={() => setViewMode('ANALYSIS')}
            className={`flex-1 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${viewMode === 'ANALYSIS' ? 'bg-[#141414] text-white shadow-lg' : 'text-black/40 hover:text-black/60'}`}
          >
            Analysis
          </button>
          <button 
            onClick={() => setViewMode('TRANSPORT')}
            className={`flex-1 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${viewMode === 'TRANSPORT' ? 'bg-[#141414] text-white shadow-lg' : 'text-black/40 hover:text-black/60'}`}
          >
            Transport
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
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-black/40 w-24">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {project.items.map((item, idx) => {
                    const rate = formatNumber(calculateItemRate(item.norm_id));
                    const total = formatNumber(rate * item.quantity);
                    const isEditing = editingItemId === item.id;
                    
                    return (
                      <tr key={item.id} className="hover:bg-black/5 transition-colors group">
                        <td className="px-6 py-4 text-sm font-mono opacity-40">{idx + 1}</td>
                        <td className="px-6 py-4">
                          <p className="text-sm font-bold leading-tight">{item.description}</p>
                          <span className="text-[10px] font-bold uppercase tracking-tighter text-black/30">
                            {norms.find(n => n.id === item.norm_id)?.type} Norm
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm font-mono opacity-60">{item.unit}</td>
                        <td className="px-6 py-4">
                          {isEditing ? (
                            <input
                              type="number"
                              value={editForm.quantity}
                              onChange={(e) => setEditForm({ ...editForm, quantity: parseFloat(e.target.value) })}
                              className="w-24 p-1 border border-black/10 rounded-lg text-sm"
                              step="0.01"
                              min="0"
                            />
                          ) : (
                            <span className="text-sm font-bold">{item.quantity}</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm font-mono">Rs. {rate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="px-6 py-4 text-sm font-bold">Rs. {total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="px-6 py-4 text-xs font-medium text-black/40">{item.ref_ss || '-'}</td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            {isEditing ? (
                              <>
                                <button 
                                  onClick={() => handleSaveEdit(item.id)}
                                  className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"
                                  title="Save"
                                >
                                  <Save size={16} />
                                </button>
                                <button 
                                  onClick={handleCancelEdit}
                                  className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                                  title="Cancel"
                                >
                                  <XCircle size={16} />
                                </button>
                              </>
                            ) : (
                              <>
                                <button 
                                  onClick={() => handleEditItem(item)}
                                  className="p-2 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                                  title="Edit"
                                >
                                  <Edit2 size={16} />
                                </button>
                                <button 
                                  onClick={() => handleDeleteItem(item.id)}
                                  className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                                  title="Delete"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </>
                            )}
                          </div>
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
                      <td colSpan={3} className="px-6 py-5 text-2xl font-bold tracking-tighter text-emerald-600">Rs. {formatNumber(calculateTotalBOQ()).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
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
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-black/40 w-24">Type</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-black/40">Resource Name</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-black/40 w-16">Unit</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-black/40 w-28">Quantity</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-black/40 w-28">Unit Rate</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-black/40 w-28">Amount</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-black/40 w-20">VAT</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-black/40 w-28">Transport</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-black/40 w-32">Total Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {resources.map((res, idx) => (
                    <tr key={idx} className={`hover:bg-black/5 transition-colors ${res.type === 'Percentage' ? 'bg-amber-50/30' : ''}`}>
                      <td className="px-6 py-4">
                        {res.type === 'Percentage' ? (
                          <span className="px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-tighter bg-amber-100 text-amber-700">
                            %
                          </span>
                        ) : (
                          <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-tighter ${
                            res.type === 'Labour' ? 'bg-blue-100 text-blue-700' : 
                            res.type === 'Material' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'
                          }`}>
                            {res.type}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm font-bold">{res.name}</td>
                      <td className="px-6 py-4 text-sm font-mono opacity-60">{res.unit}</td>
                      <td className="px-6 py-4 text-sm font-bold">{formatNumber(res.quantity).toLocaleString(undefined, { maximumFractionDigits: 3 })}</td>
                      <td className="px-6 py-4 text-sm font-mono">Rs. {formatNumber(res.rate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="px-6 py-4 text-sm font-mono">Rs. {formatNumber(res.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="px-6 py-4 text-sm font-mono">
                        {res.apply_vat ? (
                          <span className="text-amber-600 font-bold">Rs. {formatNumber(res.vatAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        ) : (
                          <span className="text-black/30">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm font-mono">
                        {res.transportCost > 0 ? (
                          <span className="text-blue-600 font-bold">Rs. {formatNumber(res.transportCost).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        ) : (
                          <span className="text-black/30">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-emerald-600">Rs. {formatNumber(res.totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-[#F5F5F0] border-t border-black/10">
                    <td colSpan={8} className="px-6 py-5 text-sm font-bold uppercase tracking-widest text-right text-black/60">Total Resource Amount (with VAT & Transport)</td>
                    <td className="px-6 py-5 text-2xl font-bold tracking-tighter text-emerald-600">
                      Rs. {formatNumber(totalResourcesAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tfoot>
              </table>
              <div className="p-6 bg-emerald-50 border-t border-emerald-100 flex items-center gap-3">
                <CheckCircle2 className="text-emerald-600" size={20} />
                <p className="text-xs font-medium text-emerald-800">
                  Verification: Resources total (Rs. {formatNumber(totalResourcesAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}) matches BOQ total {project.mode === 'CONTRACTOR' ? 'before overhead' : 'amount'}.
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
                              <p className="text-2xl font-bold tracking-tighter text-emerald-600">Rs. {formatNumber(calculateItemRate(item.norm_id)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                            </div>
                          </div>

                          <div className="space-y-8">
                            <ProjectAnalysisTable 
                              title="Labour" 
                              resources={norm.resources.filter(r => r.resource_type === 'Labour')} 
                              rates={rates} 
                              mode={project.mode}
                              normId={norm.id}
                              allResources={norm.resources}
                              overrides={overrides}
                              onSaveOverride={handleSaveOverride}
                              formatNumber={formatNumber}
                            />
                            <ProjectAnalysisTable 
                              title="Material" 
                              resources={norm.resources.filter(r => r.resource_type === 'Material')} 
                              rates={rates} 
                              mode={project.mode}
                              normId={norm.id}
                              allResources={norm.resources}
                              overrides={overrides}
                              onSaveOverride={handleSaveOverride}
                              formatNumber={formatNumber}
                            />
                            <ProjectAnalysisTable 
                              title="Equipment" 
                              resources={norm.resources.filter(r => r.resource_type === 'Equipment')} 
                              rates={rates} 
                              mode={project.mode}
                              normId={norm.id}
                              allResources={norm.resources}
                              overrides={overrides}
                              onSaveOverride={handleSaveOverride}
                              formatNumber={formatNumber}
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
          ) : viewMode === 'TRANSPORT' && transportSettings ? (
            <motion.div 
              key="transport"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-8 space-y-8"
            >
              {/* Mode Selection */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">Mode of Transportation</label>
                  <div className="flex gap-4 p-4 bg-[#F5F5F0]/30 rounded-2xl">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="transportMode"
                        value="TRUCK"
                        checked={transportSettings.transport_mode === 'TRUCK'}
                        onChange={(e) => updateTransportSetting('transport_mode', e.target.value as 'TRUCK' | 'TRACTOR')}
                        className="w-4 h-4"
                      />
                      <span className="text-sm font-bold">Truck</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="transportMode"
                        value="TRACTOR"
                        checked={transportSettings.transport_mode === 'TRACTOR'}
                        onChange={(e) => updateTransportSetting('transport_mode', e.target.value as 'TRUCK' | 'TRACTOR')}
                        className="w-4 h-4"
                      />
                      <span className="text-sm font-bold">Tractor</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Distances */}
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">Metalled Distance (km)</label>
                  <input
                    type="number"
                    value={transportSettings.metalled_distance}
                    onChange={(e) => updateTransportSetting('metalled_distance', parseFloat(e.target.value))}
                    className="w-full p-3 bg-[#F5F5F0] rounded-xl border-none focus:ring-2 focus:ring-black/5"
                    step="0.1"
                    min="0"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">Gravelled Distance (km)</label>
                  <input
                    type="number"
                    value={transportSettings.gravelled_distance}
                    onChange={(e) => updateTransportSetting('gravelled_distance', parseFloat(e.target.value))}
                    className="w-full p-3 bg-[#F5F5F0] rounded-xl border-none focus:ring-2 focus:ring-black/5"
                    step="0.1"
                    min="0"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">Porter Distance (km)</label>
                  <input
                    type="number"
                    value={transportSettings.porter_distance}
                    onChange={(e) => updateTransportSetting('porter_distance', parseFloat(e.target.value))}
                    className="w-full p-3 bg-[#F5F5F0] rounded-xl border-none focus:ring-2 focus:ring-black/5"
                    step="0.1"
                    min="0"
                  />
                </div>
              </div>

              {/* Coefficients */}
              <div className="grid grid-cols-2 gap-8">
                {/* Porter Coefficients */}
                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-black/40">Porter Coefficients (per kg per kosh)</h3>
                  <div className="space-y-3">
                    <div className="flex items-center gap-4">
                      <label className="w-24 text-sm">Easy:</label>
                      <input
                        type="number"
                        value={transportSettings.porter_easy}
                        onChange={(e) => updateTransportSetting('porter_easy', parseFloat(e.target.value))}
                        className="flex-1 p-2 bg-[#F5F5F0] rounded-xl border-none"
                        step="0.1"
                      />
                    </div>
                    <div className="flex items-center gap-4">
                      <label className="w-24 text-sm">Difficult:</label>
                      <input
                        type="number"
                        value={transportSettings.porter_difficult}
                        onChange={(e) => updateTransportSetting('porter_difficult', parseFloat(e.target.value))}
                        className="flex-1 p-2 bg-[#F5F5F0] rounded-xl border-none"
                        step="0.1"
                      />
                    </div>
                    <div className="flex items-center gap-4">
                      <label className="w-24 text-sm">V.Difficult:</label>
                      <input
                        type="number"
                        value={transportSettings.porter_vdifficult}
                        onChange={(e) => updateTransportSetting('porter_vdifficult', parseFloat(e.target.value))}
                        className="flex-1 p-2 bg-[#F5F5F0] rounded-xl border-none"
                        step="0.1"
                      />
                    </div>
                    <div className="flex items-center gap-4">
                      <label className="w-24 text-sm">High Volume:</label>
                      <input
                        type="number"
                        value={transportSettings.porter_high_volume}
                        onChange={(e) => updateTransportSetting('porter_high_volume', parseFloat(e.target.value))}
                        className="flex-1 p-2 bg-[#F5F5F0] rounded-xl border-none"
                        step="0.1"
                      />
                    </div>
                  </div>
                </div>

                {/* Tractor Road Coefficients */}
                {transportSettings.transport_mode === 'TRACTOR' && (
                  <div className="space-y-4">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-black/40">Tractor Road Coefficients (per kg per km)</h3>
                    <div className="space-y-3">
                      <div className="flex items-center gap-4">
                        <label className="w-24 text-sm">Metalled:</label>
                        <input
                          type="number"
                          value={transportSettings.tractor_metalled}
                          onChange={(e) => updateTransportSetting('tractor_metalled', parseFloat(e.target.value))}
                          className="flex-1 p-2 bg-[#F5F5F0] rounded-xl border-none"
                          step="0.001"
                        />
                      </div>
                      <div className="flex items-center gap-4">
                        <label className="w-24 text-sm">Gravelled:</label>
                        <input
                          type="number"
                          value={transportSettings.tractor_gravelled}
                          onChange={(e) => updateTransportSetting('tractor_gravelled', parseFloat(e.target.value))}
                          className="flex-1 p-2 bg-[#F5F5F0] rounded-xl border-none"
                          step="0.001"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Truck Road Coefficients */}
                {transportSettings.transport_mode === 'TRUCK' && (
                  <div className="space-y-4">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-black/40">Truck Road Coefficients (per kg per kosh)</h3>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left opacity-40">
                          <th className="pb-2">Category</th>
                          <th className="pb-2 text-right">Metalled</th>
                          <th className="pb-2 text-right">Gravelled</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="py-1">Easy</td>
                          <td className="text-right">
                            <input
                              type="number"
                              value={transportSettings.truck_metalled_easy}
                              onChange={(e) => updateTransportSetting('truck_metalled_easy', parseFloat(e.target.value))}
                              className="w-20 p-1 bg-[#F5F5F0] rounded-lg text-right"
                              step="0.001"
                            />
                          </td>
                          <td className="text-right">
                            <input
                              type="number"
                              value={transportSettings.truck_gravelled_easy}
                              onChange={(e) => updateTransportSetting('truck_gravelled_easy', parseFloat(e.target.value))}
                              className="w-20 p-1 bg-[#F5F5F0] rounded-lg text-right"
                              step="0.001"
                            />
                          </td>
                        </tr>
                        <tr>
                          <td className="py-1">Difficult</td>
                          <td className="text-right">
                            <input
                              type="number"
                              value={transportSettings.truck_metalled_difficult}
                              onChange={(e) => updateTransportSetting('truck_metalled_difficult', parseFloat(e.target.value))}
                              className="w-20 p-1 bg-[#F5F5F0] rounded-lg text-right"
                              step="0.001"
                            />
                          </td>
                          <td className="text-right">
                            <input
                              type="number"
                              value={transportSettings.truck_gravelled_difficult}
                              onChange={(e) => updateTransportSetting('truck_gravelled_difficult', parseFloat(e.target.value))}
                              className="w-20 p-1 bg-[#F5F5F0] rounded-lg text-right"
                              step="0.001"
                            />
                          </td>
                        </tr>
                        <tr>
                          <td className="py-1">V.Difficult</td>
                          <td className="text-right">
                            <input
                              type="number"
                              value={transportSettings.truck_metalled_vdifficult}
                              onChange={(e) => updateTransportSetting('truck_metalled_vdifficult', parseFloat(e.target.value))}
                              className="w-20 p-1 bg-[#F5F5F0] rounded-lg text-right"
                              step="0.001"
                            />
                          </td>
                          <td className="text-right">
                            <input
                              type="number"
                              value={transportSettings.truck_gravelled_vdifficult}
                              onChange={(e) => updateTransportSetting('truck_gravelled_vdifficult', parseFloat(e.target.value))}
                              className="w-20 p-1 bg-[#F5F5F0] rounded-lg text-right"
                              step="0.001"
                            />
                          </td>
                        </tr>
                        <tr>
                          <td className="py-1">High Volume</td>
                          <td className="text-right">
                            <input
                              type="number"
                              value={transportSettings.truck_metalled_high_volume}
                              onChange={(e) => updateTransportSetting('truck_metalled_high_volume', parseFloat(e.target.value))}
                              className="w-20 p-1 bg-[#F5F5F0] rounded-lg text-right"
                              step="0.001"
                            />
                          </td>
                          <td className="text-right">
                            <input
                              type="number"
                              value={transportSettings.truck_gravelled_high_volume}
                              onChange={(e) => updateTransportSetting('truck_gravelled_high_volume', parseFloat(e.target.value))}
                              className="w-20 p-1 bg-[#F5F5F0] rounded-lg text-right"
                              step="0.001"
                            />
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Material Transport Table */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold uppercase tracking-widest">Material Transportation Breakdown (Per Unit)</h3>
                  <button
                    onClick={saveTransportSettings}
                    className="px-6 py-2 bg-[#141414] text-white rounded-xl font-bold text-sm hover:bg-black transition-all"
                  >
                    Save Transport Data
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-[#F5F5F0]/50 border-b border-black/5">
                        <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-black/40">Material</th>
                        <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-black/40">Unit Weight (kg)</th>
                        <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-black/40">Category</th>
                        <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-black/40 text-right">Metalled (Rs./unit)</th>
                        <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-black/40 text-right">Gravelled (Rs./unit)</th>
                        <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-black/40 text-right">Porter (Rs./unit)</th>
                        <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-black/40 text-right">Total (Rs./unit)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/5">
                      {transportMaterials.map((material, idx) => (
                        <tr key={idx} className="hover:bg-black/5 transition-colors">
                          <td className="px-4 py-3 text-sm font-bold">{material.material_name}</td>
                          <td className="px-4 py-3">
                            {editingUnitWeight === material.material_name ? (
                              <input
                                type="number"
                                value={tempUnitWeight}
                                onChange={(e) => setTempUnitWeight(parseFloat(e.target.value))}
                                onBlur={() => {
                                  updateUnitWeight(material.material_name, tempUnitWeight);
                                  setEditingUnitWeight(null);
                                }}
                                onKeyPress={(e) => {
                                  if (e.key === 'Enter') {
                                    updateUnitWeight(material.material_name, tempUnitWeight);
                                    setEditingUnitWeight(null);
                                  }
                                }}
                                className="w-20 p-1 bg-[#F5F5F0] rounded-lg text-sm"
                                step="0.1"
                                autoFocus
                              />
                            ) : (
                              <div 
                                className="flex items-center gap-2 cursor-pointer group"
                                onClick={() => {
                                  setTempUnitWeight(material.unit_weight);
                                  setEditingUnitWeight(material.material_name);
                                }}
                              >
                                <span className="text-sm font-mono">{material.unit_weight}</span>
                                <Edit2 size={14} className="opacity-0 group-hover:opacity-100 transition-opacity text-blue-400" />
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <select
                              value={material.load_category}
                              onChange={(e) => updateLoadCategory(material.material_name, e.target.value as any)}
                              className="p-1 bg-[#F5F5F0] rounded-lg text-sm border-none"
                            >
                              <option value="EASY">Easy</option>
                              <option value="DIFFICULT">Difficult</option>
                              <option value="VDIFFICULT">V.Difficult</option>
                              <option value="HIGH_VOLUME">High Volume</option>
                            </select>
                          </td>
                          <td className="px-4 py-3 text-sm font-mono text-right">Rs. {formatNumber(material.metalled_cost_per_unit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td className="px-4 py-3 text-sm font-mono text-right">Rs. {formatNumber(material.gravelled_cost_per_unit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td className="px-4 py-3 text-sm font-mono text-right">Rs. {formatNumber(material.porter_cost_per_unit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td className="px-4 py-3 text-sm font-bold text-emerald-600 text-right">Rs. {formatNumber(material.total_cost_per_unit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {/* Add Item Modal with Search */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden"
          >
            <div className="p-8 border-b border-black/5 bg-[#F5F5F0]/50 flex items-center justify-between">
              <h2 className="text-2xl font-bold tracking-tight">Add Item to BOQ</h2>
              <button onClick={() => { setIsAddModalOpen(false); setSearchTerm(''); }} className="p-2 hover:bg-black/5 rounded-full transition-colors">
                <X size={24} />
              </button>
            </div>
            <div className="p-8 space-y-6">
              {/* Search Input */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">Search Work Item</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-black/20" size={20} />
                  <input 
                    type="text"
                    className="w-full p-3 pl-10 bg-[#F5F5F0] rounded-xl border-none focus:ring-2 focus:ring-black/5 text-sm font-bold"
                    placeholder="Type to search... e.g., excavation, concrete, brick"
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setShowSearchResults(true);
                    }}
                    onFocus={() => setShowSearchResults(true)}
                  />
                </div>
              </div>

              {/* Search Results */}
              {showSearchResults && searchTerm && (
                <div className="border border-black/5 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                  {filteredNorms.length > 0 ? (
                    filteredNorms.map(norm => (
                      <button
                        key={norm.id}
                        className="w-full text-left p-4 hover:bg-[#F5F5F0] border-b border-black/5 last:border-b-0 transition-colors"
                        onClick={() => {
                          setNewItem({ ...newItem, norm_id: norm.id });
                          setSearchTerm(norm.description);
                          setShowSearchResults(false);
                        }}
                      >
                        <div className="flex justify-between items-start mb-1">
                          <span className="text-xs font-bold uppercase tracking-widest text-emerald-600">{norm.type} Norm</span>
                          <span className="text-xs text-black/30">{norm.ref_ss || '-'}</span>
                        </div>
                        <p className="text-sm font-bold">{norm.description}</p>
                        <p className="text-xs text-black/40 mt-1">Unit: {norm.unit}</p>
                      </button>
                    ))
                  ) : (
                    <div className="p-8 text-center text-black/20">
                      <p className="text-sm">No norms found matching "{searchTerm}"</p>
                    </div>
                  )}
                </div>
              )}

              {/* Selected Item Display */}
              {newItem.norm_id > 0 && (
                <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700 mb-2">Selected Item</p>
                  <p className="text-sm font-bold text-emerald-900">
                    {norms.find(n => n.id === newItem.norm_id)?.description}
                  </p>
                </div>
              )}

              {/* Quantity Input */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">Quantity</label>
                <div className="flex gap-4 items-center">
                  <input 
                    type="number" 
                    className="flex-1 p-3 bg-[#F5F5F0] rounded-xl border-none focus:ring-2 focus:ring-black/5 text-sm font-bold"
                    placeholder="Enter quantity"
                    value={newItem.quantity || ''}
                    onChange={e => setNewItem({ ...newItem, quantity: parseFloat(e.target.value) })}
                    step="0.01"
                    min="0"
                  />
                  <span className="text-sm font-mono opacity-40">
                    {norms.find(n => n.id === newItem.norm_id)?.unit || 'unit'}
                  </span>
                </div>
              </div>

              {/* Rate Preview */}
              {newItem.norm_id > 0 && (
                <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 flex gap-3">
                  <Info className="text-blue-600 shrink-0" size={20} />
                  <div>
                    <p className="text-xs font-bold text-blue-900 uppercase tracking-widest mb-1">Rate Preview</p>
                    <p className="text-sm text-blue-800">
                      Calculated Rate: <span className="font-bold">Rs. {formatNumber(calculateItemRate(newItem.norm_id)).toLocaleString()}</span> per {norms.find(n => n.id === newItem.norm_id)?.unit}
                    </p>
                  </div>
                </div>
              )}
            </div>
            <div className="p-8 bg-[#F5F5F0]/50 border-t border-black/5 flex justify-end gap-4">
              <button onClick={() => { setIsAddModalOpen(false); setSearchTerm(''); }} className="px-6 py-3 rounded-2xl font-bold text-sm hover:bg-black/5 transition-colors">
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

function ProjectAnalysisTable({ title, resources, rates, mode, normId, allResources, overrides, onSaveOverride, formatNumber }: { 
  title: string, 
  resources: any[], 
  rates: Rate[], 
  mode: 'CONTRACTOR' | 'USERS', 
  normId: number,
  allResources: any[],
  overrides: RateOverride[],
  onSaveOverride: (normId: number, resourceName: string, overrideRate: number | null, overrideQuantity: number | null) => void,
  formatNumber: (num: number) => number
}) {
  const [editingResource, setEditingResource] = useState<string | null>(null);
  const [editRateValue, setEditRateValue] = useState<number>(0);
  const [editQtyValue, setEditQtyValue] = useState<number>(0);

  const getOverride = (resourceName: string) => {
    return overrides.find(o => o.norm_id === normId && o.resource_name === resourceName);
  };

  const labourTotal = allResources.reduce((acc, res) => {
    if (res.is_percentage || res.resource_type !== 'Labour') return acc;
    const override = getOverride(res.name);
    let rate = override?.override_rate ?? rates.find(r => r.name.toLowerCase() === res.name.toLowerCase())?.rate ?? 0;
    const quantity = override?.override_quantity ?? res.quantity;
    if (mode === 'USERS') {
      const rateObj = rates.find(r => r.name.toLowerCase() === res.name.toLowerCase());
      if (rateObj?.apply_vat) rate = rate * 1.13;
    }
    return acc + (quantity * rate);
  }, 0);

  const materialTotal = allResources.reduce((acc, res) => {
    if (res.is_percentage || res.resource_type !== 'Material') return acc;
    const override = getOverride(res.name);
    let rate = override?.override_rate ?? rates.find(r => r.name.toLowerCase() === res.name.toLowerCase())?.rate ?? 0;
    const quantity = override?.override_quantity ?? res.quantity;
    if (mode === 'USERS') {
      const rateObj = rates.find(r => r.name.toLowerCase() === res.name.toLowerCase());
      if (rateObj?.apply_vat) rate = rate * 1.13;
    }
    return acc + (quantity * rate);
  }, 0);

  const equipmentTotal = allResources.reduce((acc, res) => {
    if (res.is_percentage || res.resource_type !== 'Equipment') return acc;
    const override = getOverride(res.name);
    let rate = override?.override_rate ?? rates.find(r => r.name.toLowerCase() === res.name.toLowerCase())?.rate ?? 0;
    const quantity = override?.override_quantity ?? res.quantity;
    if (mode === 'USERS') {
      const rateObj = rates.find(r => r.name.toLowerCase() === res.name.toLowerCase());
      if (rateObj?.apply_vat) rate = rate * 1.13;
    }
    return acc + (quantity * rate);
  }, 0);

  const fixedTotal = labourTotal + materialTotal + equipmentTotal;

  if (resources.length === 0) return null;

  const handleEditStart = (resource: any) => {
    const override = getOverride(resource.name);
    setEditingResource(resource.name);
    setEditRateValue(override?.override_rate ?? rates.find(r => r.name.toLowerCase() === resource.name.toLowerCase())?.rate ?? 0);
    setEditQtyValue(override?.override_quantity ?? resource.quantity);
  };

  const handleEditSave = (resource: any) => {
    onSaveOverride(normId, resource.name, editRateValue, editQtyValue);
    setEditingResource(null);
  };

  const handleEditCancel = () => {
    setEditingResource(null);
  };

  const handleRemoveOverride = (resource: any) => {
    if (window.confirm('Remove project-specific override and revert to global values?')) {
      onSaveOverride(normId, resource.name, null, null);
    }
  };

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
            <th className="pb-2 font-medium text-center">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-black/5">
          {resources.map((res, i) => {
            const override = getOverride(res.name);
            const isEditing = editingResource === res.name;
            
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
                  const baseOverride = getOverride(baseRes.name);
                  let rate = baseOverride?.override_rate ?? rates.find(r => r.name.toLowerCase() === baseRes.name.toLowerCase())?.rate ?? 0;
                  const quantity = baseOverride?.override_quantity ?? baseRes.quantity;
                  if (mode === 'USERS') {
                    const rateObj = rates.find(r => r.name.toLowerCase() === baseRes.name.toLowerCase());
                    if (rateObj?.apply_vat) rate = rate * 1.13;
                  }
                  base = quantity * rate;
                }
              }
              amount = (res.quantity / 100) * base;
              rateDisplay = `${res.quantity}% of ${res.percentage_base}`;
            } else {
              let rate = override?.override_rate ?? rateObj?.rate ?? 0;
              const quantity = override?.override_quantity ?? res.quantity;
              if (mode === 'USERS' && rateObj?.apply_vat) rate = rate * 1.13;
              amount = quantity * rate;
              rateDisplay = rate.toLocaleString();
            }

            const hasOverride = override && (override.override_rate !== null || override.override_quantity !== null);

            return (
              <tr key={i} className={`group ${hasOverride ? 'bg-amber-50/30' : ''}`}>
                <td className="py-2 font-medium">
                  {res.name}
                  {hasOverride && (
                    <span className="ml-2 text-[8px] font-bold uppercase tracking-widest text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">
                      Override
                    </span>
                  )}
                </td>
                <td className="py-2 text-center font-mono">
                  {res.is_percentage ? (
                    <span>{res.quantity}%</span>
                  ) : (
                    isEditing ? (
                      <input 
                        type="number"
                        value={editQtyValue}
                        onChange={(e) => setEditQtyValue(parseFloat(e.target.value))}
                        className="w-16 bg-white border border-amber-200 rounded px-1 text-center"
                        step="0.01"
                      />
                    ) : (
                      <span>{override?.override_quantity ?? res.quantity}</span>
                    )
                  )}
                  <span className="ml-1 opacity-40">{res.unit}</span>
                </td>
                <td className="py-2 text-right font-mono text-black/40">
                  {!res.is_percentage && (
                    isEditing ? (
                      <div className="flex items-center justify-end gap-1">
                        <span>Rs.</span>
                        <input 
                          type="number"
                          value={editRateValue}
                          onChange={(e) => setEditRateValue(parseFloat(e.target.value))}
                          className="w-20 bg-white border border-amber-200 rounded px-1 text-right"
                          step="0.01"
                        />
                      </div>
                    ) : (
                      <span className={hasOverride ? 'text-amber-700 font-bold' : ''}>
                        Rs. {rateDisplay}
                      </span>
                    )
                  )}
                </td>
                <td className="py-2 text-right font-mono font-bold">Rs. {formatNumber(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td className="py-2 text-center">
                  {!res.is_percentage && (
                    <div className="flex items-center justify-center gap-1">
                      {isEditing ? (
                        <>
                          <button 
                            onClick={() => handleEditSave(res)}
                            className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                            title="Save"
                          >
                            <Save size={14} />
                          </button>
                          <button 
                            onClick={handleEditCancel}
                            className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"
                            title="Cancel"
                          >
                            <XCircle size={14} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button 
                            onClick={() => handleEditStart(res)}
                            className="p-1 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Edit project-specific values"
                          >
                            <Edit2 size={14} />
                          </button>
                          {hasOverride && (
                            <button 
                              onClick={() => handleRemoveOverride(res)}
                              className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Remove override"
                            >
                              <X size={14} />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}