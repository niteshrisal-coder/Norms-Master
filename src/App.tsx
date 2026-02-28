import React, { useState, useEffect, lazy, Suspense } from 'react';
import { 
  LayoutDashboard, 
  BookOpen, 
  DollarSign, 
  Calculator, 
  FolderKanban, 
  Menu, 
  X,
  ChevronRight,
  Plus,
  Trash2,
  Edit,
  Download,
  Search,
  Filter
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Norm, Rate, Project, ProjectDetail } from './types';
import Dashboard from './pages/Dashboard';
import Norms from './pages/Norms';
import Rates from './pages/Rates';
import RateAnalysis from './pages/RateAnalysis';
import Projects from './pages/Projects';
const ProjectBOQ = lazy(() => import('./pages/ProjectBOQ'));

export default function App() {
  const [activePage, setActivePage] = useState('dashboard');
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const navigateToProject = (id: number) => {
    setSelectedProjectId(id);
    setActivePage('project-boq');
  };

  const renderPage = () => {
    switch (activePage) {
      case 'dashboard': return <Dashboard onNavigate={setActivePage} />;
      case 'norms': return <Norms />;
      case 'rates': return <Rates />;
      case 'rate-analysis': return <RateAnalysis />;
      case 'projects': return <Projects onSelectProject={navigateToProject} />;
      case 'project-boq': return selectedProjectId ? (
        <Suspense fallback={
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-black/20 border-t-black" />
          </div>
        }>
          <ProjectBOQ 
            projectId={selectedProjectId} 
            onBack={() => setActivePage('projects')} 
          />
        </Suspense>
      ) : <Projects onSelectProject={navigateToProject} />;
      default: return <Dashboard onNavigate={setActivePage} />;
    }
  };

  return (
    <div className="flex h-screen bg-[#F5F5F0] text-[#141414] font-sans overflow-hidden">
      {/* Sidebar */}
      <motion.aside 
        initial={false}
        animate={{ width: isSidebarOpen ? 260 : 80 }}
        className="bg-[#141414] text-white flex flex-col transition-all duration-300 ease-in-out z-50"
      >
        <div className="p-6 flex items-center justify-between">
          {isSidebarOpen && (
            <motion.h1 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-xl font-bold tracking-tighter italic"
            >
              NORMS MASTER
            </motion.h1>
          )}
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-1 hover:bg-white/10 rounded-lg transition-colors"
          >
            {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-2">
          <NavItem 
            icon={<LayoutDashboard size={20} />} 
            label="Dashboard" 
            active={activePage === 'dashboard'} 
            onClick={() => setActivePage('dashboard')}
            collapsed={!isSidebarOpen}
          />
          <NavItem 
            icon={<BookOpen size={20} />} 
            label="Norms" 
            active={activePage === 'norms'} 
            onClick={() => setActivePage('norms')}
            collapsed={!isSidebarOpen}
          />
          <NavItem 
            icon={<DollarSign size={20} />} 
            label="Rates" 
            active={activePage === 'rates'} 
            onClick={() => setActivePage('rates')}
            collapsed={!isSidebarOpen}
          />
          <NavItem 
            icon={<Calculator size={20} />} 
            label="Rate Analysis" 
            active={activePage === 'rate-analysis'} 
            onClick={() => setActivePage('rate-analysis')}
            collapsed={!isSidebarOpen}
          />
          <NavItem 
            icon={<FolderKanban size={20} />} 
            label="My Projects" 
            active={activePage === 'projects' || activePage === 'project-boq'} 
            onClick={() => setActivePage('projects')}
            collapsed={!isSidebarOpen}
          />
        </nav>

        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-xs font-bold">
              AD
            </div>
            {isSidebarOpen && (
              <div className="overflow-hidden">
                <p className="text-sm font-medium truncate">Admin User</p>
                <p className="text-xs text-white/50 truncate">admin@norms.com</p>
              </div>
            )}
          </div>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative">
        <header className="sticky top-0 bg-[#F5F5F0]/80 backdrop-blur-md border-bottom border-[#141414]/10 h-16 flex items-center px-8 justify-between z-40">
          <h2 className="text-sm font-semibold uppercase tracking-widest opacity-50">
            {activePage.replace('-', ' ')}
          </h2>
          <div className="flex items-center gap-4">
            <button className="p-2 hover:bg-black/5 rounded-full transition-colors">
              <Search size={18} />
            </button>
            <div className="h-4 w-[1px] bg-black/10" />
            <span className="text-xs font-mono opacity-50">{new Date().toLocaleDateString()}</span>
          </div>
        </header>

        <div className="p-8 max-w-7xl mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activePage + (selectedProjectId || '')}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {renderPage()}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

function NavItem({ icon, label, active, onClick, collapsed }: { 
  icon: React.ReactNode, 
  label: string, 
  active: boolean, 
  onClick: () => void,
  collapsed: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`
        w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200
        ${active 
          ? 'bg-white text-[#141414] shadow-lg shadow-black/20' 
          : 'text-white/60 hover:text-white hover:bg-white/5'}
      `}
    >
      <span className={active ? 'text-[#141414]' : 'text-white/60'}>{icon}</span>
      {!collapsed && (
        <span className="text-sm font-medium tracking-tight">{label}</span>
      )}
      {active && !collapsed && (
        <motion.div 
          layoutId="active-pill"
          className="ml-auto"
        >
          <ChevronRight size={14} />
        </motion.div>
      )}
    </button>
  );
}
