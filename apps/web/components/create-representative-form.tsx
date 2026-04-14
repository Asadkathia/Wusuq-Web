"use client";

import React, { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ChevronDown, Send, User, Mail, Phone, MapPin, Building2, Landmark, Check } from "lucide-react";

gsap.registerPlugin(useGSAP);

const services = [
  { id: 1, name: "Lower Court Paralegal Service" },
  { id: 2, name: "Special Court Paralegal Service" },
  { id: 3, name: "High Court Paralegal Service" },
  { id: 4, name: "Federal Shariat Court Paralegal Service" },
  { id: 5, name: "Superme Court Paralegal Service" },
  { id: 6, name: "Registry/Deed Paralegal Service" },
  { id: 7, name: "FIR" },
];

const courtsByService: Record<number, string[]> = {
  1: ["Sessions Court", "Magisterial Court", "Civil Court", "Family Court"],
  2: [
    "Accountability Courts",
    "Anti-Terrorism Courts",
    "Banking Courts",
    "Commercial Courts",
    "Consumer Courts",
    "Election Tribunal",
  ],
  3: [
    "Lahore High Court",
    "Sindh High Court",
    "Peshawar High Court",
    "Balochistan High Court",
    "Islamabad High Court",
  ],
  4: ["Islamabad Court"],
  5: ["Supreme Court"],
  6: [],
  7: [],
};

export default function CreateRepresentativeForm() {
  const containerRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const [selectedService, setSelectedService] = useState<number | "">("");
  const [selectedCourt, setSelectedCourt] = useState<string>("");

  useGSAP(() => {
    const tl = gsap.timeline();

    // Container entrance with subtle 3D rotate
    tl.from(containerRef.current, {
      y: 80,
      opacity: 0,
      rotateX: 10,
      scale: 0.95,
      duration: 1.2,
      ease: "power3.out",
    });

    // Staggered form sections
    const inputs = gsap.utils.toArray(".form-element");
    tl.from(
      inputs,
      {
        y: 30,
        opacity: 0,
        rotateX: -5,
        duration: 0.8,
        stagger: 0.08,
        ease: "power2.out",
      },
      "-=0.6"
    );
  }, { scope: containerRef });

  const inputClasses = 
    "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 focus:bg-white/10 transition-all duration-300 ease-out backdrop-blur-sm";

  const labelClasses = "block text-sm font-medium text-slate-300 mb-1.5 flex items-center gap-2";

  return (
    <div className="min-h-screen bg-[#070b14] flex items-center justify-center p-6 relative overflow-hidden" style={{ perspective: "1200px" }}>
      <style>{`
        @keyframes shimmer {
          100% { transform: translateX(100%); }
        }
      `}</style>
      
      {/* 3D Background Elements */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/20 rounded-full blur-[100px] pointer-events-none -translate-x-1/2 -translate-y-1/2"></div>
      <div className="absolute bottom-1/4 right-1/4 w-[30rem] h-[30rem] bg-indigo-600/20 rounded-full blur-[120px] pointer-events-none translate-x-1/2 translate-y-1/2"></div>
      
      {/* Isometric Grid Background */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)", backgroundSize: "40px 40px", transform: "rotateX(60deg) rotateZ(-45deg) scale(3)" }}></div>

      <div 
        ref={containerRef}
        className="w-full max-w-2xl bg-white/[0.04] backdrop-blur-[16px] rounded-3xl p-8 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.1)] border border-white/10 relative z-10"
      >
        <div className="mb-10 text-center form-element">
          <h1 className="text-3xl font-semibold text-white tracking-tight mb-2">Create Clerk</h1>
          <p className="text-slate-400">Add a new representative to the system.</p>
        </div>

        <form ref={formRef} className="space-y-6" onSubmit={(e) => e.preventDefault()}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Name */}
            <div className="form-element group">
              <label htmlFor="name" className={labelClasses}>
                <User size={16} className="text-blue-400" /> Full Name
              </label>
              <div className="relative">
                <input type="text" id="name" placeholder="John Doe" className={inputClasses} />
              </div>
            </div>

            {/* Email */}
            <div className="form-element group">
              <label htmlFor="email" className={labelClasses}>
                <Mail size={16} className="text-blue-400" /> Email Address
              </label>
              <div className="relative">
                <input type="email" id="email" placeholder="clerk@example.com" className={inputClasses} />
              </div>
            </div>

            {/* Phone */}
            <div className="form-element group">
              <label htmlFor="phone" className={labelClasses}>
                <Phone size={16} className="text-blue-400" /> Phone Number
              </label>
              <div className="relative">
                <input type="tel" id="phone" placeholder="+92 300 1234567" className={inputClasses} />
              </div>
            </div>

            {/* Address */}
            <div className="form-element group">
              <label htmlFor="address" className={labelClasses}>
                <MapPin size={16} className="text-blue-400" /> Address
              </label>
              <div className="relative">
                <input type="text" id="address" placeholder="123 Street, City" className={inputClasses} />
              </div>
            </div>
            
          </div>

          <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent my-8 form-element"></div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Service */}
            <div className="form-element group">
              <label htmlFor="service" className={labelClasses}>
                <Landmark size={16} className="text-indigo-400" /> Assigned Service
              </label>
              <div className="relative">
                <select 
                  id="service" 
                  className={`${inputClasses} appearance-none cursor-pointer`}
                  value={selectedService}
                  onChange={(e) => {
                    setSelectedService(Number(e.target.value));
                    setSelectedCourt(""); // Reset court on service change
                  }}
                >
                  <option value="" disabled className="bg-slate-900 text-slate-300">Select a service...</option>
                  {services.map(s => (
                    <option key={s.id} value={s.id} className="bg-slate-900 text-slate-100">{s.name}</option>
                  ))}
                </select>
                <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none group-focus-within:text-blue-400 transition-colors" />
              </div>
            </div>

            {/* Courts */}
            <div className="form-element group">
              <label htmlFor="court" className={labelClasses}>
                <Building2 size={16} className="text-indigo-400" /> Court
              </label>
              <div className="relative">
                <select 
                  id="court" 
                  className={`${inputClasses} appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed`}
                  value={selectedCourt}
                  onChange={(e) => setSelectedCourt(e.target.value)}
                  disabled={!selectedService || !courtsByService[selectedService as number]?.length}
                >
                  <option value="" disabled className="bg-slate-900">
                    {!selectedService ? "Select service first" : "Select a court..."}
                  </option>
                  {selectedService && courtsByService[selectedService as number]?.map(c => (
                    <option key={c} value={c} className="bg-slate-900 text-slate-100">{c}</option>
                  ))}
                </select>
                <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none group-focus-within:text-blue-400 transition-colors" />
              </div>
            </div>
            
            {/* Court City */}
            <div className="form-element group md:col-span-2">
              <label htmlFor="court_city" className={labelClasses}>
                <MapPin size={16} className="text-indigo-400" /> Court City
              </label>
              <div className="relative">
                <input type="text" id="court_city" placeholder="Lahore" className={inputClasses} />
              </div>
            </div>

          </div>

          <div className="pt-6 form-element flex justify-end">
            <button
              type="button"
              className="group relative overflow-hidden rounded-xl bg-blue-600 px-8 py-3.5 font-medium text-white shadow-[0_0_20px_rgba(37,99,235,0.3)] transition-all hover:bg-blue-500 hover:shadow-[0_0_30px_rgba(37,99,235,0.5)] active:scale-95 duration-300"
            >
              <span className="relative z-10 flex items-center justify-center gap-2">
                Create Representative
                <Send size={16} className="group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-transform duration-300" />
              </span>
              {/* Highlight sweep */}
              <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent group-hover:animate-[shimmer_1.5s_infinite]"></div>
            </button>
          </div>
        </form>
      </div>

    </div>
  );
}
