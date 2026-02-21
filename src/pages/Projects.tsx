import React, { useState, useEffect } from 'react';
import { Plus, Search, FolderKanban, Calendar, ArrowRight, Trash2, Edit } from 'lucide-react';
import { Project } from '../types';
import { motion } from 'motion/react';

export default function Projects({ onSelectProject }: { onSelectProject: (id: number) => void }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newProject, setNewProject] = useState({ name: '', description: '', mode: 'CONTRACTOR' as 'CONTRACTOR' | 'USERS' });

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    const res = await fetch('/api/projects');
    setProjects(await res.json());
  };

  const handleCreate = async () => {
    if (!newProject.name) return;
    await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newProject)
    });
    setNewProject({ name: '', description: '', mode: 'CONTRACTOR' });
    setIsModalOpen(false);
    fetchProjects();
  };

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div className="space-y-1">
          <h1 className="text-4xl font-bold tracking-tighter italic">My Projects</h1>
          <p className="text-black/50">Create and manage project-specific Bills of Quantities (BOQ).</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-[#141414] text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-black transition-all shadow-lg shadow-black/10"
        >
          <Plus size={20} />
          New Project
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {projects.map(project => (
          <motion.div 
            whileHover={{ y: -4 }}
            key={project.id}
            onClick={() => onSelectProject(project.id)}
            className="bg-white p-8 rounded-3xl shadow-sm border border-black/5 cursor-pointer group hover:shadow-xl transition-all"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
                <FolderKanban size={24} />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-black/20 flex items-center gap-1">
                <Calendar size={12} />
                {new Date(project.created_at).toLocaleDateString()}
              </span>
            </div>
            <h3 className="text-xl font-bold tracking-tight mb-2 group-hover:text-emerald-600 transition-colors">{project.name}</h3>
            <p className="text-sm text-black/40 line-clamp-2 mb-8 h-10">{project.description || 'No description provided.'}</p>
            
            <div className="flex items-center justify-between pt-6 border-t border-black/5">
              <span className="text-xs font-bold uppercase tracking-widest text-black/40">Open BOQ</span>
              <div className="w-8 h-8 rounded-full bg-[#F5F5F0] flex items-center justify-center group-hover:bg-emerald-500 group-hover:text-white transition-all">
                <ArrowRight size={16} />
              </div>
            </div>
          </motion.div>
        ))}

        {projects.length === 0 && (
          <div className="col-span-full py-24 flex flex-col items-center justify-center text-black/20 border-2 border-dashed border-black/5 rounded-3xl">
            <FolderKanban size={64} strokeWidth={1} className="mb-4" />
            <p className="font-medium">No projects yet. Create your first one to start building BOQs.</p>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
          >
            <div className="p-8 border-b border-black/5 bg-[#F5F5F0]/50">
              <h2 className="text-2xl font-bold tracking-tight">Create Project</h2>
            </div>
            <div className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">Project Name</label>
                <input 
                  type="text" 
                  className="w-full p-3 bg-[#F5F5F0] rounded-xl border-none focus:ring-2 focus:ring-black/5 text-sm font-bold"
                  placeholder="e.g. Kathmandu Road Expansion"
                  value={newProject.name}
                  onChange={e => setNewProject({ ...newProject, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">Description</label>
                <textarea 
                  className="w-full p-3 bg-[#F5F5F0] rounded-xl border-none focus:ring-2 focus:ring-black/5 text-sm min-h-[100px]"
                  placeholder="Project details, location, etc."
                  value={newProject.description}
                  onChange={e => setNewProject({ ...newProject, description: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">Project Mode</label>
                <div className="flex bg-[#F5F5F0] p-1 rounded-xl border border-black/5 shadow-sm">
                  <button
                    onClick={() => setNewProject({ ...newProject, mode: 'CONTRACTOR' })}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${newProject.mode === 'CONTRACTOR' ? 'bg-[#141414] text-white shadow-md' : 'text-black/40 hover:text-black/60'}`}
                  >
                    Contractor
                  </button>
                  <button
                    onClick={() => setNewProject({ ...newProject, mode: 'USERS' })}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${newProject.mode === 'USERS' ? 'bg-[#141414] text-white shadow-md' : 'text-black/40 hover:text-black/60'}`}
                  >
                    Users Committee
                  </button>
                </div>
              </div>
            </div>
            <div className="p-8 bg-[#F5F5F0]/50 border-t border-black/5 flex justify-end gap-4">
              <button onClick={() => setIsModalOpen(false)} className="px-6 py-3 rounded-2xl font-bold text-sm hover:bg-black/5 transition-colors">
                Cancel
              </button>
              <button 
                onClick={handleCreate}
                className="bg-[#141414] text-white px-8 py-3 rounded-2xl font-bold text-sm hover:bg-black transition-all shadow-lg shadow-black/10"
              >
                Create Project
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
