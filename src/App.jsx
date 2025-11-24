import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, Package, FlaskConical, Library, ShoppingBag, 
  Plus, Search, Trash2, Edit2, CheckCircle, MapPin, 
  X, Lock, LogOut, ArrowLeft, AlertTriangle
} from 'lucide-react';

// --- FIREBASE IMPORTS ---
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';

// --- BURAYA KENDİ GERÇEK BİLGİLERİNİ YAPIŞTIR ---
const firebaseConfig = {
  apiKey: "AIzaSyC9PFnnFYo6duqfKmMWfkVNPZxtmESfcac",
  authDomain: "parfumapp-6c10c.firebaseapp.com",
  projectId: "parfumapp-6c10c",
  storageBucket: "parfumapp-6c10c.firebasestorage.app",
  messagingSenderId: "415360983274",
  appId: "1:415360983274:web:f60879761d517c29aff793"
};

// --- BAĞLANTIYI BAŞLAT (TRY-CATCH YOK - HATA VARSA PATLASIN) ---
console.log("Firebase başlatılıyor..."); // KONSOL LOG 1
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
console.log("Firebase başlatıldı ✅"); // KONSOL LOG 2

const appId = 'my-perfume-app-v1';
const APP_ACCESS_CODE = "2024"; 

// --- BAŞLANGIÇ VERİLERİ ---
const initialRaw = [
  { id: 1, name: 'Bergamot Yağı', quantity: 50, unit: 'ml', minStock: 10 },
];
const initialProducts = [
  { id: 1, name: 'Midnight Rose', size: '50ml', description: 'Gece serisi.', stock: 5, price: 1200 },
];

export default function PerfumeMasterV3() {
  const [user, setUser] = useState(null);
  const [isAppUnlocked, setIsAppUnlocked] = useState(false);
  const [accessInput, setAccessInput] = useState('');
  const [activeTab, setActiveTab] = useState('production');

  // State
  const [rawMaterials, setRawMaterials] = useState(initialRaw);
  const [products, setProducts] = useState(initialProducts);
  const [batches, setBatches] = useState([]);
  const [orders, setOrders] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [toast, setToast] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null);

  // --- 1. AUTH VE DİNLEME (LOGLU) ---
  useEffect(() => {
    console.log("Auth deneniyor..."); // KONSOL LOG 3
    signInAnonymously(auth)
      .then(() => console.log("Giriş Başarılı! ✅"))
      .catch((e) => console.error("GİRİŞ HATASI 🚨:", e));

    const unsubscribe = onAuthStateChanged(auth, (u) => {
        if(u) {
            console.log("Kullanıcı aktif:", u.uid); // KONSOL LOG 4
            setUser(u);
        } else {
            console.log("Kullanıcı yok ❌");
            setUser(null);
        }
    });

    if(sessionStorage.getItem('app_unlocked') === 'true') setIsAppUnlocked(true);
    return () => unsubscribe();
  }, []);

  // --- 2. VERİ DİNLEME ---
  useEffect(() => {
    if (!user) return;
    const basePath = `artifacts/${appId}/public/data/app_data`;
    
    // Sadece bir tanesini loglayalım kirlilik olmasın
    const unsubBatches = onSnapshot(doc(db, basePath, 'batches'), (d) => {
        console.log("Veritabanından Veri Geldi (Batches) 📥", d.exists());
        if (d.exists()) setBatches(d.data().items || []);
    }, (err) => console.error("VERİ OKUMA HATASI 🚨:", err));

    // Diğer dinleyiciler...
    const unsubRaw = onSnapshot(doc(db, basePath, 'rawMaterials'), (d) => { if (d.exists()) setRawMaterials(d.data().items || []); });
    const unsubProd = onSnapshot(doc(db, basePath, 'products'), (d) => { if (d.exists()) setProducts(d.data().items || []); });
    const unsubOrders = onSnapshot(doc(db, basePath, 'orders'), (d) => { if (d.exists()) setOrders(d.data().items || []); });

    return () => { unsubBatches(); unsubRaw(); unsubProd(); unsubOrders(); };
  }, [user]);

  // --- 3. DB KAYIT (LOGLU) ---
  const saveToDb = async (docName, data) => {
      console.log(`Kaydediliyor: ${docName}...`); // KONSOL LOG 5
      if (!db) { console.error("DB YOK! ❌"); return; }
      if (!user) { console.error("KULLANICI YOK! ❌"); return; }
      
      try {
          const basePath = `artifacts/${appId}/public/data/app_data`;
          await setDoc(doc(db, basePath, docName), { items: data });
          console.log(`Kayıt Başarılı: ${docName} ✅`); // KONSOL LOG 6
      } catch (error) {
          console.error("KAYIT HATASI 🚨:", error); // BURASI HATAYI GÖSTERECEK
          alert("HATA: " + error.message); // Ekrana da hata bassın
      }
  };

  const updateRaw = (newData) => { setRawMaterials(newData); saveToDb('rawMaterials', newData); };
  const updateProd = (newData) => { setProducts(newData); saveToDb('products', newData); };
  const updateBatches = (newData) => { setBatches(newData); saveToDb('batches', newData); };
  const updateOrders = (newData) => { setOrders(newData); saveToDb('orders', newData); };

  const showToast = (message, type = 'success') => { setToast({ message, type }); };
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); } }, [toast]);

  const handleLogin = (e) => {
      e.preventDefault();
      if (accessInput === APP_ACCESS_CODE) {
          setIsAppUnlocked(true);
          sessionStorage.setItem('app_unlocked', 'true');
      } else { showToast("Hatalı Şifre!", "error"); }
  };
  
  const handleLogout = () => { setIsAppUnlocked(false); sessionStorage.removeItem('app_unlocked'); };

  // --- VIEWS ---
  const ProductionView = () => {
    const [isNew, setIsNew] = useState(false);
    const [batchForm, setBatchForm] = useState({ name: '', size: '50ml', quantity: '', duration: '30' });
    
    const handleSubmit = () => {
        if(!batchForm.name || !batchForm.quantity) return;
        const newBatch = { id: Date.now(), ...batchForm, startDate: new Date().toISOString(), status: 'macerating' };
        // Önce State'i güncelle
        const newBatches = [newBatch, ...batches];
        setBatches(newBatches); 
        // Sonra DB'ye yazmayı dene
        saveToDb('batches', newBatches);
        
        showToast('Üretim başladı.');
        setIsNew(false);
    };

    return (
        <div className="space-y-4 pb-24">
            <div className="flex justify-between items-center px-1"><h2 className="text-2xl font-bold">Üretim</h2><button onClick={()=>setIsNew(true)} className="bg-slate-900 text-white px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1"><FlaskConical size={16}/> Yeni</button></div>
            {isNew && (
                <div className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-md rounded-2xl p-6 space-y-3">
                         <h3 className="font-bold">Yeni Parti</h3>
                         <input className="w-full p-2 border rounded" placeholder="Parfüm Adı" value={batchForm.name} onChange={e=>setBatchForm({...batchForm, name:e.target.value})} />
                         <div className="flex gap-2"><input type="number" className="flex-1 p-2 border rounded" placeholder="Adet" value={batchForm.quantity} onChange={e=>setBatchForm({...batchForm, quantity:e.target.value})} /><input type="number" className="flex-1 p-2 border rounded" placeholder="Gün" value={batchForm.duration} onChange={e=>setBatchForm({...batchForm, duration:e.target.value})} /></div>
                         <button onClick={handleSubmit} className="w-full py-3 bg-slate-900 text-white font-bold rounded-xl">Başlat</button>
                         <button onClick={()=>setIsNew(false)} className="w-full py-2 bg-slate-100 rounded-xl">İptal</button>
                    </div>
                </div>
            )}
            <div className="space-y-3">{batches.map(b => (
                <div key={b.id} className="bg-white p-4 rounded-xl border shadow-sm">
                    <h3 className="font-bold">{b.name}</h3><div className="text-xs text-slate-500">{b.quantity} Adet • {b.duration} Gün</div>
                </div>
            ))}</div>
        </div>
    );
  };

  const InventoryView = () => (
    <div className="space-y-4 pb-24">
        <div className="flex justify-between px-1"><h2 className="text-2xl font-bold">Depo</h2></div>
        <div className="grid gap-3">{rawMaterials.map(item => (<div key={item.id} className="bg-white p-4 rounded-xl border shadow-sm flex justify-between"><div><div className="font-bold">{item.name}</div><div className="text-xs text-slate-400">Min: {item.minStock}</div></div><div className="font-bold">{item.quantity} {item.unit}</div></div>))}</div>
    </div>
  );

  const CatalogView = () => (
      <div className="space-y-4 pb-24"><h2 className="text-2xl font-bold px-1">Katalog</h2><div className="grid gap-3">{products.map(p => (<div key={p.id} className="bg-white p-4 rounded-xl border shadow-sm flex justify-between"><div><div className="font-bold">{p.name}</div><span className="bg-slate-100 px-2 text-xs font-bold rounded">{p.size}</span></div><div className="text-right font-bold">{p.stock} Adet</div></div>))}</div></div>
  );

  if (!isAppUnlocked) {
      return (
          <div className="flex flex-col h-screen bg-slate-900 items-center justify-center p-6">
              <div className="bg-white p-8 rounded-2xl w-full max-w-sm shadow-2xl text-center">
                  <div className="bg-amber-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"><Lock className="text-amber-600" size={32} /></div>
                  <h1 className="text-2xl font-serif font-bold text-slate-900 mb-2">Parfumeur Pro</h1>
                  <form onSubmit={handleLogin}>
                      <input type="password" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-center text-2xl tracking-widest font-bold mb-4 outline-none" placeholder="Şifre" value={accessInput} onChange={(e) => setAccessInput(e.target.value)} />
                      <button type="submit" className="w-full py-4 bg-slate-900 text-white font-bold rounded-xl">Giriş Yap</button>
                  </form>
              </div>
          </div>
      );
  }

  return (
    <div className="flex flex-col h-screen bg-slate-50 font-sans text-slate-900 relative">
      {toast && (<div className={`fixed top-6 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-full shadow-xl z-50 text-white font-bold text-sm ${toast.type==='error'?'bg-rose-600':'bg-emerald-600'}`}>{toast.message}</div>)}
      <div className="h-safe-top bg-white w-full"></div>
      <main className="flex-1 overflow-y-auto p-4">{activeTab === 'production' && <ProductionView />}{activeTab === 'catalog' && <CatalogView />}{activeTab === 'inventory' && <InventoryView />}</main>
      <div className="fixed bottom-0 w-full bg-white/90 backdrop-blur-md border-t pb-safe-bottom z-40"><div className="flex justify-around items-center h-16"><NavBtn id="production" icon={FlaskConical} label="Üretim" active={activeTab} set={setActiveTab} /><NavBtn id="catalog" icon={Library} label="Katalog" active={activeTab} set={setActiveTab} /><NavBtn id="inventory" icon={Package} label="Depo" active={activeTab} set={setActiveTab} /></div></div>
    </div>
  );
}
const NavBtn = ({ id, icon: Icon, label, active, set }) => (<button onClick={() => set(id)} className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${active === id ? 'text-slate-900 bg-slate-100 scale-105' : 'text-slate-400 hover:bg-slate-50'}`}><Icon size={20} /><span className="text-[9px] font-medium">{label}</span></button>);