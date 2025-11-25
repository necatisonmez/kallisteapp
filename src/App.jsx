import React, { useState, useEffect } from 'react';
import { 
  Package, FlaskConical, Library, ShoppingBag, 
  Plus, Trash2, CheckCircle, MapPin, 
  X, Lock, AlertTriangle, TrendingUp, TrendingDown,
  Droplets, Wallet, Loader2, AlertCircle, ArrowRight, Globe, Clock, PenTool, Edit3
} from 'lucide-react';

// --- FIREBASE IMPORTS ---
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  onSnapshot
} from 'firebase/firestore';

// --- INITIALIZATION (SİZİN VERİLERİNİZ) ---
const firebaseConfig = {
  apiKey: "AIzaSyC9PFnnFYo6duqfKmMWfkVNPZxtmESfcac",
  authDomain: "parfumapp-6c10c.firebaseapp.com",
  projectId: "parfumapp-6c10c",
  storageBucket: "parfumapp-6c10c.firebasestorage.app",
  messagingSenderId: "415360983274",
  appId: "1:415360983274:web:f60879761d517c29aff793"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Veritabanı içinde verilerin saklanacağı ana klasör adı.
const DATA_NAMESPACE = 'kalliste-tracker-v4';

// GİRİŞ ŞİFRESİ
const APP_ACCESS_CODE = "kalliste25"; 

// --- YARDIMCI FONKSİYONLAR ---
const formatMoney = (amt) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(amt || 0);
const formatDate = (d) => new Date(d).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
const getDaysLeft = (start, duration) => {
    const endDate = new Date(new Date(start).getTime() + (parseInt(duration) * 86400000));
    const diff = endDate - new Date();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

export default function KallisteAppV4() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isAppUnlocked, setIsAppUnlocked] = useState(false);
  const [accessInput, setAccessInput] = useState('');
  const [activeTab, setActiveTab] = useState('production'); 

  // --- STATES ---
  const [rawMaterials, setRawMaterials] = useState([]);
  const [products, setProducts] = useState([]);
  const [batches, setBatches] = useState([]);
  const [orders, setOrders] = useState([]);
  const [transactions, setTransactions] = useState([]);
  
  const [toast, setToast] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null);

  // --- AUTH SETUP ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (err) {
        console.error("Auth init error:", err);
        showToast("Giriş yapılamadı. İnternet bağlantınızı kontrol edin.", "error");
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, u => {
        setUser(u);
        setAuthLoading(false);
    });
    
    if(sessionStorage.getItem('app_unlocked') === 'true') {
        setIsAppUnlocked(true);
    }

    return () => unsubscribe();
  }, []);

  // --- DATA SYNC (ORTAK VERİTABANI) ---
  const getDocRef = (collectionName) => {
    return doc(db, 'artifacts', DATA_NAMESPACE, 'public', 'data', collectionName, 'items');
  };

  useEffect(() => {
    if (!user || !db) return;
    
    const collectionsToSync = [
        { name: 'rawMaterials', setter: setRawMaterials },
        { name: 'products', setter: setProducts },
        { name: 'batches', setter: setBatches },
        { name: 'orders', setter: setOrders },
        { name: 'transactions', setter: setTransactions }
    ];

    const unsubs = collectionsToSync.map(({ name, setter }) => {
        return onSnapshot(
            getDocRef(name), 
            (d) => {
                if (d.exists()) {
                    let items = d.data().items || [];
                    
                    // --- SIRALAMA MANTIĞI ---
                    if (['rawMaterials', 'products'].includes(name)) {
                        // Alfabetik Sıralama (A-Z) - Türkçe karakter uyumlu
                        items.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
                    } else if (['batches', 'orders', 'transactions'].includes(name)) {
                        // Tarih Sıralaması (Yeniden Eskiye)
                        items.sort((a, b) => {
                             // date veya startDate alanına bak
                             const dateA = new Date(a.date || a.startDate || 0);
                             const dateB = new Date(b.date || b.startDate || 0);
                             return dateB - dateA;
                        });
                    }

                    setter(items);
                } else {
                    setter([]);
                }
            },
            (error) => {
                console.error(`Sync error for ${name}:`, error);
            }
        );
    });

    return () => unsubs.forEach(u => u());
  }, [user]);

  // --- KAYIT FONKSİYONU ---
  const saveToDb = async (collectionName, data) => {
      if(!db || !user) return;
      try {
          await setDoc(getDocRef(collectionName), { items: data });
      } catch(e) { 
          console.error("Save failed:", e);
          showToast("Kaydedilemedi: Yetki hatası.", "error"); 
      }
  };

  const showToast = (message, type='success') => { setToast({message, type}); setTimeout(()=>setToast(null), 3000); };
  const showConfirm = (message, onConfirm) => setConfirmModal({message, onConfirm});

  // --- İŞLEM GEÇMİŞİ ---
  const addTransaction = (type, desc, amount) => {
      const newTrans = { id: Date.now(), type, desc, amount: parseFloat(amount), date: new Date().toISOString() };
      const updated = [newTrans, ...transactions];
      setTransactions(updated);
      saveToDb('transactions', updated);
  };

  // --- 3. BÖLÜM: ÜRETİM ---
  const ProductionView = () => {
    const [isNew, setIsNew] = useState(false);
    const [editBatch, setEditBatch] = useState(null);
    const [form, setForm] = useState({ name: '', quantity: '', duration: '30', ingredients: [] });
    const [selIng, setSelIng] = useState('');
    const [selAmount, setSelAmount] = useState('');

    // Kritik Sipariş Analizi
    const criticalOrders = orders.filter(o => o.status === 'needs_production');
    const productionTargets = criticalOrders.reduce((acc, curr) => {
        const existing = acc.find(item => item.name === curr.product);
        if(existing) {
            existing.totalNeeded += parseInt(curr.quantity);
            existing.orderCount += 1;
        } else {
            acc.push({ name: curr.product, totalNeeded: parseInt(curr.quantity), orderCount: 1 });
        }
        return acc;
    }, []);

    const addIngredient = () => {
        const mat = rawMaterials.find(r => r.id === parseInt(selIng));
        if(!mat || !selAmount) return;
        setForm({...form, ingredients: [...form.ingredients, { ...mat, usedAmount: parseFloat(selAmount) }]});
        setSelIng(''); setSelAmount('');
    };

    const handleStartProduction = () => {
        if(!form.name || !form.quantity) return;
        
        let stockError = false;
        const newRaw = rawMaterials.map(r => {
            const used = form.ingredients.find(i => i.id === r.id);
            if(used) {
                if(r.quantity < used.usedAmount) stockError = true;
                return { ...r, quantity: r.quantity - used.usedAmount };
            }
            return r;
        });

        if(stockError) { showToast('Yetersiz Hammadde Stoğu!', 'error'); return; }

        setRawMaterials(newRaw);
        saveToDb('rawMaterials', newRaw);

        const batchId = `PRD-${Math.floor(Math.random()*10000)}`;
        const newBatch = { 
            id: batchId, 
            name: form.name, 
            quantity: parseInt(form.quantity), 
            startDate: new Date().toISOString(), 
            duration: parseInt(form.duration), 
            status: 'macerating',
            ingredients: form.ingredients
        };
        const updatedBatches = [newBatch, ...batches];
        setBatches(updatedBatches);
        saveToDb('batches', updatedBatches);

        const updatedOrders = orders.map(o => {
            if(o.status === 'needs_production' && o.product === form.name) {
                return { ...o, status: 'waiting', note: 'Üretim başlatıldı, demleniyor.' };
            }
            return o;
        });
        if(JSON.stringify(updatedOrders) !== JSON.stringify(orders)) {
            setOrders(updatedOrders);
            saveToDb('orders', updatedOrders);
        }

        showToast(`${form.quantity} adet ${form.name} üretime alındı.`);
        setIsNew(false);
    };

    const handleQuickProduce = (targetName, targetQty) => {
        setForm({ 
            name: targetName, 
            quantity: targetQty, 
            duration: '30', 
            ingredients: [] 
        });
        setIsNew(true);
    };

    const handleBottle = (batch) => {
        showConfirm(`${batch.name} şişelenip stoğa eklensin mi?`, () => {
            const existingProd = products.find(p => p.name === batch.name);
            let newProducts;
            
            if(existingProd) {
                newProducts = products.map(p => p.id === existingProd.id ? { ...p, stock: p.stock + batch.quantity } : p);
            } else {
                newProducts = [...products, { id: Date.now(), name: batch.name, stock: batch.quantity, price: 0, size: '50ml' }];
            }
            
            setProducts(newProducts);
            saveToDb('products', newProducts);

            const updatedBatches = batches.map(b => b.id === batch.id ? { ...b, status: 'completed', bottleDate: new Date().toISOString() } : b);
            setBatches(updatedBatches);
            saveToDb('batches', updatedBatches);
            showToast('Kataloğa eklendi!');
        });
    };

    const handleUpdateBatch = () => {
        const newBatches = batches.map(b => b.id === editBatch.id ? editBatch : b);
        setBatches(newBatches);
        saveToDb('batches', newBatches);
        setEditBatch(null);
        showToast('Üretim güncellendi!');
    };

    const handleDeleteBatch = (id) => {
        showConfirm('Bu üretim kaydı silinsin mi?', () => {
            const newBatches = batches.filter(b => b.id !== id);
            setBatches(newBatches);
            saveToDb('batches', newBatches);
        });
    };

    return (
        <div className="space-y-4 pb-24">
             <div className="flex justify-between items-center px-1">
                <h2 className="text-2xl font-bold text-slate-800">Üretim</h2>
                <button onClick={()=>{
                    setForm({ name: '', quantity: '', duration: '30', ingredients: [] });
                    setIsNew(true);
                }} className="bg-slate-900 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg hover:bg-slate-800 transition-all"><FlaskConical size={18}/> Yeni Parti</button>
             </div>

            {productionTargets.length > 0 && (
                <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4 animate-in slide-in-from-top-2">
                    <div className="flex items-center gap-2 text-rose-700 mb-3">
                        <AlertCircle size={20} />
                        <h3 className="font-bold text-sm uppercase">Acil Üretim Hedefleri</h3>
                    </div>
                    <div className="space-y-2">
                        {productionTargets.map((target, idx) => (
                            <div key={idx} className="bg-white p-3 rounded-xl border border-rose-100 flex justify-between items-center shadow-sm">
                                <div>
                                    <div className="font-bold text-slate-800">{target.name}</div>
                                    <div className="text-xs text-rose-500 font-bold">{target.totalNeeded} adet eksik ({target.orderCount} sipariş)</div>
                                </div>
                                <button 
                                    onClick={() => handleQuickProduce(target.name, target.totalNeeded)}
                                    className="bg-rose-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 hover:bg-rose-600 transition-colors"
                                >
                                    Üret <ArrowRight size={12}/>
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

             <div className="grid gap-3">
                {batches.filter(b => b.status === 'macerating').map(batch => {
                    const daysLeft = getDaysLeft(batch.startDate, batch.duration);
                    const progress = Math.min(100, Math.max(0, 100 - (daysLeft / batch.duration * 100)));
                    const isReady = daysLeft <= 0;

                    return (
                        <div key={batch.id} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden group">
                            <div className="flex justify-between items-start mb-2 relative z-10">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-slate-400 font-bold tracking-wider">{batch.id}</span>
                                        <button onClick={()=>setEditBatch(batch)} className="text-slate-300 hover:text-indigo-500 transition-colors"><Edit3 size={12}/></button>
                                        <button onClick={()=>handleDeleteBatch(batch.id)} className="text-slate-300 hover:text-rose-500 transition-colors"><Trash2 size={12}/></button>
                                    </div>
                                    <h3 className="font-bold text-lg text-slate-800">{batch.name}</h3>
                                    <div className="text-sm text-slate-500">{batch.quantity} Şişe Hedefleniyor</div>
                                </div>
                                <div className={`text-center p-2 rounded-xl min-w-[80px] ${isReady ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                                    <div className="font-bold text-xl">{isReady ? <CheckCircle size={24} className="mx-auto"/> : daysLeft}</div>
                                    <div className="text-[10px] uppercase font-bold">{isReady ? 'HAZIR' : 'GÜN KALDI'}</div>
                                </div>
                            </div>
                            
                            <div className="w-full bg-slate-100 h-2 rounded-full mb-3 overflow-hidden">
                                <div className={`h-full transition-all duration-1000 ${isReady ? 'bg-emerald-500' : 'bg-amber-400'}`} style={{width: `${progress}%`}}></div>
                            </div>

                            <div className="text-xs text-slate-400 mb-3">
                                {batch.ingredients?.map(i => i.name).join(', ')} kullanıldı.
                            </div>

                            {isReady && (
                                <button onClick={()=>handleBottle(batch)} className="w-full py-3 bg-slate-900 text-white font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors">
                                    <Package size={18}/> Şişele ve Stoğa Ekle
                                </button>
                            )}
                        </div>
                    );
                })}
                {batches.filter(b => b.status === 'macerating').length === 0 && productionTargets.length === 0 && (
                    <div className="text-center text-slate-400 py-10">Aktif üretim veya hedef yok.</div>
                )}
             </div>

             {/* ÜRETİM DÜZENLEME MODALI */}
             {editBatch && (
                <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white w-full max-w-sm rounded-2xl p-6 space-y-3 animate-in zoom-in-95">
                        <div className="flex justify-between items-center border-b pb-2">
                            <h3 className="font-bold text-lg">Üretim Düzenle</h3>
                            <button onClick={()=>setEditBatch(null)}><X size={20} className="text-slate-400"/></button>
                        </div>
                        <div className="space-y-3">
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase">Parfüm Adı</label>
                                <input className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1" value={editBatch.name} onChange={e=>setEditBatch({...editBatch, name:e.target.value})} />
                            </div>
                            <div className="flex gap-3">
                                <div className="flex-1">
                                    <label className="text-xs font-bold text-slate-500 uppercase">Hedef</label>
                                    <input type="number" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1" value={editBatch.quantity} onChange={e=>setEditBatch({...editBatch, quantity:parseInt(e.target.value)})} />
                                </div>
                                <div className="flex-1">
                                    <label className="text-xs font-bold text-slate-500 uppercase">Süre (Gün)</label>
                                    <input type="number" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1" value={editBatch.duration} onChange={e=>setEditBatch({...editBatch, duration:parseInt(e.target.value)})} />
                                </div>
                            </div>
                        </div>
                        <button onClick={handleUpdateBatch} className="w-full py-3 bg-slate-900 text-white font-bold rounded-xl shadow-lg hover:bg-slate-800">Değişiklikleri Kaydet</button>
                    </div>
                </div>
             )}

             {isNew && (
                 <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
                     <div className="bg-white w-full max-w-md rounded-2xl p-6 space-y-4 animate-in slide-in-from-bottom-10 max-h-[85vh] overflow-y-auto">
                        <div className="flex justify-between items-center border-b pb-4">
                            <h3 className="font-bold text-lg">Yeni Üretim Başlat</h3>
                            <button onClick={()=>setIsNew(false)} className="p-2 bg-slate-100 rounded-full"><X size={20}/></button>
                        </div>
                        
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Parfüm Adı</label>
                            <input className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1 font-medium" placeholder="Örn: Royal Oud" value={form.name} onChange={e=>setForm({...form, name:e.target.value})} />
                        </div>

                        <div className="flex gap-3">
                            <div className="flex-1">
                                <label className="text-xs font-bold text-slate-500 uppercase">Hedef (Adet)</label>
                                <input type="number" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1" value={form.quantity} onChange={e=>setForm({...form, quantity:e.target.value})} />
                            </div>
                            <div className="flex-1">
                                <label className="text-xs font-bold text-slate-500 uppercase">Süre (Gün)</label>
                                <input type="number" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1" value={form.duration} onChange={e=>setForm({...form, duration:e.target.value})} />
                            </div>
                        </div>

                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                            <label className="text-xs font-bold text-slate-500 uppercase block mb-2">Reçete / Kullanılan Malzemeler</label>
                            <div className="flex gap-2 mb-3">
                                <select className="flex-1 p-2 border rounded-lg text-sm" value={selIng} onChange={e=>setSelIng(e.target.value)}>
                                    <option value="">Malzeme Seç...</option>
                                    {/* Hammaddeler artık Alfabetik */}
                                    {rawMaterials.map(r => <option key={r.id} value={r.id}>{r.name} ({r.quantity} {r.unit})</option>)}
                                </select>
                                <input className="w-20 p-2 border rounded-lg text-sm" placeholder="Miktar" value={selAmount} onChange={e=>setSelAmount(e.target.value)} />
                                <button onClick={addIngredient} className="bg-emerald-500 text-white p-2 rounded-lg"><Plus size={20}/></button>
                            </div>
                            <div className="space-y-2">
                                {form.ingredients.map((ing, idx) => (
                                    <div key={idx} className="flex justify-between text-sm bg-white p-2 rounded border border-slate-100">
                                        <span>{ing.name}</span>
                                        <span className="font-bold text-rose-500">-{ing.usedAmount} {ing.unit}</span>
                                    </div>
                                ))}
                                {form.ingredients.length === 0 && <div className="text-xs text-slate-400 text-center italic">Henüz malzeme eklenmedi.</div>}
                            </div>
                        </div>

                        <button onClick={handleStartProduction} className="w-full py-4 bg-slate-900 text-white font-bold rounded-xl text-lg shadow-xl hover:bg-slate-800">Üretimi Başlat</button>
                     </div>
                 </div>
             )}
        </div>
    );
  };

  // --- 4. BÖLÜM: KATALOG ---
  const CatalogView = () => {
    const [editProd, setEditProd] = useState(null);

    const handleSell = (prod) => {
        showConfirm(`${prod.name} satışı yapılsın mı? Stoktan 1 düşülecek.`, () => {
             const newProds = products.map(p => p.id === prod.id ? { ...p, stock: p.stock - 1 } : p);
             setProducts(newProds);
             saveToDb('products', newProds);
             if(prod.price > 0) addTransaction('income', `${prod.name} Satışı`, prod.price);
             showToast('Satış başarılı! Gelir eklendi.');
        });
    };

    const handleUpdateProduct = () => {
        const newProds = products.map(p => p.id === editProd.id ? editProd : p);
        setProducts(newProds);
        saveToDb('products', newProds);
        setEditProd(null);
        showToast('Ürün güncellendi!');
    };

    return (
        <div className="space-y-4 pb-24">
            <h2 className="text-2xl font-bold px-1 text-slate-800">Katalog</h2>
            
            {batches.some(b => b.status === 'macerating') && (
                <div className="mb-4">
                    <h3 className="text-xs font-bold text-slate-400 uppercase mb-2 px-1">Yakında Gelecekler</h3>
                    <div className="flex gap-3 overflow-x-auto pb-2">
                        {batches.filter(b => b.status === 'macerating').map(b => (
                            <div key={b.id} className="min-w-[140px] bg-amber-50 p-3 rounded-xl border border-amber-100 flex-shrink-0">
                                <div className="font-bold text-slate-800 text-sm truncate">{b.name}</div>
                                <div className="text-xs text-amber-600 font-bold">{getDaysLeft(b.startDate, b.duration)} gün kaldı</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="grid gap-3">
                {products.map(p => (
                    <div key={p.id} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex flex-col gap-3">
                        <div className="flex justify-between items-start">
                            <div>
                                <h3 className="font-bold text-lg text-slate-800">{p.name}</h3>
                                <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded text-xs font-bold">{p.size || '50ml'}</span>
                            </div>
                            <div className="text-right">
                                <div className={`text-sm font-bold px-2 py-1 rounded ${p.stock > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                    {p.stock > 0 ? `${p.stock} Stok` : 'Tükendi'}
                                </div>
                                <div className="font-bold text-slate-900 mt-1">{formatMoney(p.price)}</div>
                            </div>
                        </div>
                        <div className="flex gap-2 pt-2 border-t border-slate-50">
                            <button onClick={()=>handleSell(p)} disabled={p.stock<=0} className="flex-1 py-2 bg-slate-900 text-white rounded-lg text-sm font-bold disabled:opacity-50">
                                {p.stock > 0 ? 'Satış Yap' : 'Stok Yok'}
                            </button>
                            <button onClick={()=>setEditProd(p)} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm font-bold flex items-center justify-center gap-1">
                                <Edit3 size={16}/> Düzenle
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {editProd && (
                 <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                     <div className="bg-white w-full max-w-sm rounded-2xl p-6 space-y-4 animate-in zoom-in-95">
                        <div className="flex justify-between items-center border-b pb-2">
                            <h3 className="font-bold text-lg">Ürün Düzenle</h3>
                            <button onClick={()=>setEditProd(null)}><X size={20} className="text-slate-400"/></button>
                        </div>
                        
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Ürün Adı</label>
                            <input 
                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1 font-medium" 
                                value={editProd.name} 
                                onChange={e=>setEditProd({...editProd, name:e.target.value})}
                            />
                        </div>

                        <div className="flex gap-3">
                            <div className="flex-1">
                                <label className="text-xs font-bold text-slate-500 uppercase">Stok</label>
                                <input 
                                    type="number" 
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1" 
                                    value={editProd.stock} 
                                    onChange={e=>setEditProd({...editProd, stock:parseInt(e.target.value)})}
                                />
                            </div>
                            <div className="flex-1">
                                <label className="text-xs font-bold text-slate-500 uppercase">Fiyat (TL)</label>
                                <input 
                                    type="number" 
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1" 
                                    value={editProd.price} 
                                    onChange={e=>setEditProd({...editProd, price:parseFloat(e.target.value)})}
                                />
                            </div>
                        </div>

                        <div className="pt-2">
                            <button onClick={handleUpdateProduct} className="w-full py-3 bg-slate-900 text-white font-bold rounded-xl shadow-lg hover:bg-slate-800">Değişiklikleri Kaydet</button>
                        </div>
                     </div>
                 </div>
            )}
        </div>
    );
  };

  // --- 5. BÖLÜM: HAMMADDELER ---
  const MaterialsView = () => {
    const [isAdd, setIsAdd] = useState(false);
    const [editMaterial, setEditMaterial] = useState(null);
    const [form, setForm] = useState({ name: '', quantity: '', unit: 'ml', minStock: '', cost: '' });

    const handleSave = () => {
        if(!form.name) return;
        const newItem = { id: Date.now(), name: form.name, quantity: parseFloat(form.quantity), unit: form.unit, minStock: parseFloat(form.minStock) };
        const newRaw = [...rawMaterials, newItem];
        setRawMaterials(newRaw);
        saveToDb('rawMaterials', newRaw);
        
        if(form.cost) addTransaction('expense', `${form.name} Alımı`, form.cost);
        
        setIsAdd(false); setForm({ name: '', quantity: '', unit: 'ml', minStock: '', cost: '' });
    };

    const handleDelete = (id) => {
        showConfirm('Bu malzeme silinsin mi?', () => {
            const newRaw = rawMaterials.filter(r => r.id !== id);
            setRawMaterials(newRaw);
            saveToDb('rawMaterials', newRaw);
        });
    };

    const handleUpdateMaterial = () => {
        const newRaw = rawMaterials.map(r => r.id === editMaterial.id ? editMaterial : r);
        setRawMaterials(newRaw);
        saveToDb('rawMaterials', newRaw);
        setEditMaterial(null);
        showToast('Hammadde güncellendi!');
    };

    return (
        <div className="space-y-4 pb-24">
            <div className="flex justify-between items-center px-1">
                <h2 className="text-2xl font-bold text-slate-800">Hammaddeler</h2>
                <button onClick={()=>setIsAdd(true)} className="bg-slate-900 text-white px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1"><Plus size={16}/> Ekle</button>
            </div>

            {isAdd && (
                <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-sm rounded-2xl p-6 space-y-3">
                        <h3 className="font-bold">Yeni Malzeme</h3>
                        <input className="w-full p-2 border rounded-lg" placeholder="Adı (Örn: Etil Alkol)" value={form.name} onChange={e=>setForm({...form, name:e.target.value})} />
                        <div className="flex gap-2">
                            <input className="flex-1 p-2 border rounded-lg" type="number" placeholder="Miktar" value={form.quantity} onChange={e=>setForm({...form, quantity:e.target.value})} />
                            <select className="p-2 border rounded-lg" value={form.unit} onChange={e=>setForm({...form, unit:e.target.value})}>
                                <option value="ml">ml (Sıvı)</option>
                                <option value="gr">gr (Katı)</option>
                                <option value="adet">Adet (Şişe)</option>
                            </select>
                        </div>
                        <input className="w-full p-2 border rounded-lg" type="number" placeholder="Min Stok Uyarısı" value={form.minStock} onChange={e=>setForm({...form, minStock:e.target.value})} />
                        <input className="w-full p-2 border rounded-lg" type="number" placeholder="Maliyet (TL) - Opsiyonel" value={form.cost} onChange={e=>setForm({...form, cost:e.target.value})} />
                        <button onClick={handleSave} className="w-full py-3 bg-slate-900 text-white font-bold rounded-xl">Kaydet</button>
                        <button onClick={()=>setIsAdd(false)} className="w-full py-2 bg-slate-100 rounded-xl">İptal</button>
                    </div>
                </div>
            )}

            <div className="grid gap-3">
                {rawMaterials.map(m => (
                    <div key={m.id} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-full ${m.unit === 'adet' ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'}`}>
                                {m.unit === 'adet' ? <Package size={18}/> : <Droplets size={18}/>}
                            </div>
                            <div>
                                <div className="font-bold text-slate-800">{m.name}</div>
                                <div className="text-xs text-slate-400">Min: {m.minStock} {m.unit}</div>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="text-right">
                                <div className="font-bold text-lg">{m.quantity} <span className="text-xs font-normal text-slate-400">{m.unit}</span></div>
                            </div>
                            <button onClick={()=>setEditMaterial(m)} className="p-2 text-slate-400 hover:text-indigo-600"><Edit3 size={16}/></button>
                            <button onClick={()=>handleDelete(m.id)} className="p-2 text-rose-300 hover:text-rose-600"><Trash2 size={16}/></button>
                        </div>
                    </div>
                ))}
            </div>

            {editMaterial && (
                <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white w-full max-w-sm rounded-2xl p-6 space-y-3 animate-in zoom-in-95">
                        <div className="flex justify-between items-center border-b pb-2">
                            <h3 className="font-bold text-lg">Hammadde Düzenle</h3>
                            <button onClick={()=>setEditMaterial(null)}><X size={20} className="text-slate-400"/></button>
                        </div>
                        <input className="w-full p-2 border rounded-lg" placeholder="Adı" value={editMaterial.name} onChange={e=>setEditMaterial({...editMaterial, name:e.target.value})} />
                        <div className="flex gap-2">
                            <input className="flex-1 p-2 border rounded-lg" type="number" placeholder="Miktar" value={editMaterial.quantity} onChange={e=>setEditMaterial({...editMaterial, quantity:parseFloat(e.target.value)})} />
                            <select className="p-2 border rounded-lg" value={editMaterial.unit} onChange={e=>setEditMaterial({...editMaterial, unit:e.target.value})}>
                                <option value="ml">ml (Sıvı)</option>
                                <option value="gr">gr (Katı)</option>
                                <option value="adet">Adet (Şişe)</option>
                            </select>
                        </div>
                        <input className="w-full p-2 border rounded-lg" type="number" placeholder="Min Stok" value={editMaterial.minStock} onChange={e=>setEditMaterial({...editMaterial, minStock:parseFloat(e.target.value)})} />
                        <button onClick={handleUpdateMaterial} className="w-full py-3 bg-slate-900 text-white font-bold rounded-xl shadow-lg hover:bg-slate-800">Değişiklikleri Kaydet</button>
                    </div>
                </div>
            )}
        </div>
    );
  };

  // --- 6. BÖLÜM: SİPARİŞLER ---
  const OrdersView = () => {
    const [isAdd, setIsAdd] = useState(false);
    const [isManualInput, setIsManualInput] = useState(false);
    const [newOrd, setNewOrd] = useState({ customer: '', product: '', quantity: 1 });

    const handleAddOrder = () => {
        if(!newOrd.customer || !newOrd.product) return;
        
        const product = products.find(p => p.name === newOrd.product);
        const activeBatch = batches.find(b => b.name === newOrd.product && b.status === 'macerating');

        let status = 'needs_production'; 
        let note = 'Stok yok, üretim planlanmalı!';
        let variant = 'rose';

        if(product && product.stock >= parseInt(newOrd.quantity)) {
            status = 'reserved';
            note = 'Stoktan ayrıldı, teslimat bekleniyor.';
            variant = 'emerald';
            const newProds = products.map(p => p.id === product.id ? { ...p, stock: p.stock - parseInt(newOrd.quantity) } : p);
            setProducts(newProds);
            saveToDb('products', newProds);
        } else if (activeBatch) {
            status = 'waiting';
            note = 'Üretimde (Demleniyor), bekleniyor.';
            variant = 'amber';
        }

        const order = { id: Date.now(), ...newOrd, status, note, variant, date: new Date().toISOString() };
        const newOrders = [order, ...orders];
        setOrders(newOrders);
        saveToDb('orders', newOrders);
        
        if (status === 'reserved') showToast('✅ Rezerve Edildi');
        else if (status === 'waiting') showToast('⏳ Sıraya Alındı (Üretimde)');
        else showToast('🚨 DİKKAT: Üretim Planlanmalı!', 'error');

        setIsAdd(false); setNewOrd({ customer: '', product: '', quantity: 1 }); setIsManualInput(false);
    };

    const handleDeliver = (order) => {
        showConfirm('Teslim edildi ve ücreti alındı mı?', () => {
            const prod = products.find(p => p.name === order.product);
            const price = prod ? prod.price * order.quantity : 0;
            if(price > 0) addTransaction('income', `${order.product} Teslimat (${order.customer})`, price);
            const updatedOrders = orders.map(o => o.id === order.id ? { ...o, status: 'completed' } : o);
            setOrders(updatedOrders);
            saveToDb('orders', updatedOrders);
            showToast('Teslim edildi!');
        });
    };

    return (
        <div className="space-y-4 pb-24">
            <div className="flex justify-between items-center px-1">
                <h2 className="text-2xl font-bold text-slate-800">Siparişler</h2>
                <button onClick={()=>setIsAdd(true)} className="bg-slate-900 text-white px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1"><Plus size={16}/> Ekle</button>
            </div>

            {isAdd && (
                <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-sm rounded-2xl p-6 space-y-3">
                        <h3 className="font-bold">Yeni Sipariş</h3>
                        <input className="w-full p-2 border rounded-lg" placeholder="Müşteri Adı" value={newOrd.customer} onChange={e=>setNewOrd({...newOrd, customer:e.target.value})} />
                        
                        {/* Ürün Seçimi: Dropdown veya Manuel Giriş */}
                        <div className="flex gap-2">
                            {isManualInput ? (
                                <input 
                                    className="w-full p-2 border rounded-lg bg-slate-50 animate-in fade-in" 
                                    placeholder="Yeni Parfüm Adı Giriniz" 
                                    value={newOrd.product} 
                                    autoFocus
                                    onChange={e=>setNewOrd({...newOrd, product:e.target.value})} 
                                />
                            ) : (
                                <select className="w-full p-2 border rounded-lg" value={newOrd.product} onChange={e=>setNewOrd({...newOrd, product:e.target.value})}>
                                    <option value="">Parfüm Seç...</option>
                                    {[...products.map(p=>p.name), ...batches.map(b=>b.name)]
                                        .filter((v,i,a)=>a.indexOf(v)===i)
                                        .sort((a,b) => a.localeCompare(b, 'tr')) // ALFABETİK SIRALAMA EKLENDİ
                                        .map((n,i)=><option key={i} value={n}>{n}</option>)
                                    }
                                </select>
                            )}
                            <button 
                                onClick={()=>{
                                    setIsManualInput(!isManualInput);
                                    setNewOrd({...newOrd, product: ''});
                                }}
                                className={`px-3 rounded-lg text-xs font-bold shrink-0 transition-colors ${isManualInput ? 'bg-slate-200 text-slate-600' : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'}`}
                            >
                                {isManualInput ? <X size={18}/> : <Plus size={18}/>}
                            </button>
                        </div>

                        <input type="number" className="w-full p-2 border rounded-lg" placeholder="Adet" value={newOrd.quantity} onChange={e=>setNewOrd({...newOrd, quantity:e.target.value})} />
                        <button onClick={handleAddOrder} className="w-full py-3 bg-slate-900 text-white font-bold rounded-xl">Kaydet</button>
                        <button onClick={()=>setIsAdd(false)} className="w-full py-2 bg-slate-100 rounded-xl">İptal</button>
                    </div>
                </div>
            )}

            <div className="grid gap-3">
                {orders.filter(o => o.status !== 'completed').map(o => {
                    let bgClass = 'bg-slate-50 border-slate-200';
                    let statusColor = 'bg-slate-100 text-slate-700';
                    let statusText = 'Bilinmiyor';
                    let Icon = AlertCircle;

                    if (o.status === 'reserved') {
                        bgClass = 'bg-white border-emerald-100 shadow-sm';
                        statusColor = 'bg-emerald-100 text-emerald-700';
                        statusText = 'Rezerve';
                        Icon = CheckCircle;
                    } else if (o.status === 'waiting') {
                        bgClass = 'bg-amber-50 border-amber-200 shadow-sm';
                        statusColor = 'bg-amber-100 text-amber-700';
                        statusText = 'Üretim Bekliyor';
                        Icon = Clock;
                    } else if (o.status === 'needs_production') {
                        bgClass = 'bg-rose-50 border-rose-200 shadow-sm';
                        statusColor = 'bg-rose-100 text-rose-700';
                        statusText = 'Üretim Planlanmalı';
                        Icon = AlertTriangle;
                    }

                    return (
                        <div key={o.id} className={`p-4 rounded-xl border flex flex-col gap-2 ${bgClass}`}>
                            <div className="flex justify-between items-start">
                                <div>
                                    <div className="font-bold text-slate-800">{o.customer}</div>
                                    <div className="text-sm text-slate-600">{o.product} x {o.quantity}</div>
                                </div>
                                <div className={`text-[10px] font-bold px-2 py-1 rounded uppercase flex items-center gap-1 ${statusColor}`}>
                                    <Icon size={12}/> {statusText}
                                </div>
                            </div>
                            <div className="text-xs text-slate-500 italic flex items-center gap-1"><MapPin size={12}/> {o.note}</div>
                            {o.status === 'reserved' && (
                                <button onClick={()=>handleDeliver(o)} className="w-full py-2 bg-slate-900 text-white text-xs font-bold rounded-lg mt-1">Teslim Et & Tahsilat Yap</button>
                            )}
                        </div>
                    );
                })}
                {orders.length === 0 && <div className="text-center text-slate-400 py-10">Bekleyen sipariş yok.</div>}
            </div>
        </div>
    );
  };

  // --- 7. BÖLÜM: FİNANS ---
  const FinanceView = () => {
      const income = transactions.filter(t => t.type === 'income').reduce((a,b)=>a+b.amount, 0);
      const expense = transactions.filter(t => t.type === 'expense').reduce((a,b)=>a+b.amount, 0);
      const profit = income - expense;

      return (
          <div className="space-y-6 pb-24">
              <h2 className="text-2xl font-bold px-1 text-slate-800">Finans</h2>
              
              <div className="grid grid-cols-2 gap-4">
                  <div className="bg-emerald-500 text-white p-5 rounded-2xl shadow-lg shadow-emerald-200">
                      <div className="flex items-center gap-2 mb-1 opacity-80"><TrendingUp size={16}/><span className="text-xs font-bold uppercase">Gelir</span></div>
                      <div className="text-2xl font-bold">{formatMoney(income)}</div>
                  </div>
                  <div className="bg-rose-500 text-white p-5 rounded-2xl shadow-lg shadow-rose-200">
                      <div className="flex items-center gap-2 mb-1 opacity-80"><TrendingDown size={16}/><span className="text-xs font-bold uppercase">Gider</span></div>
                      <div className="text-2xl font-bold">{formatMoney(expense)}</div>
                  </div>
              </div>
              
              <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-xl flex justify-between items-center">
                  <div>
                      <div className="text-xs text-slate-400 font-bold uppercase mb-1">Net Kâr</div>
                      <div className={`text-3xl font-bold ${profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatMoney(profit)}</div>
                  </div>
                  <div className="p-3 bg-white/10 rounded-full"><Wallet size={32}/></div>
              </div>

              <div>
                  <h3 className="text-xs font-bold text-slate-400 uppercase mb-3 px-1">Son Hareketler</h3>
                  <div className="space-y-3">
                      {transactions.slice(0, 10).map(t => (
                          <div key={t.id} className="bg-white p-3 rounded-xl border border-slate-100 flex justify-between items-center text-sm">
                              <div>
                                  <div className="font-bold text-slate-700">{t.desc}</div>
                                  <div className="text-xs text-slate-400">{formatDate(t.date)}</div>
                              </div>
                              <div className={`font-bold ${t.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                  {t.type === 'income' ? '+' : '-'}{formatMoney(t.amount)}
                              </div>
                          </div>
                      ))}
                      {transactions.length === 0 && <div className="text-center text-slate-400 italic text-xs">Henüz işlem yok.</div>}
                  </div>
              </div>
          </div>
      );
  };

  // --- ANA RENDER ---
  if (!isAppUnlocked) {
      return (
          <div className="flex flex-col h-screen bg-slate-900 items-center justify-center p-6">
              <div className="bg-white p-8 rounded-3xl w-full max-w-sm shadow-2xl text-center">
                  <div className="bg-amber-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner"><Lock className="text-amber-600" size={40} /></div>
                  <h1 className="text-3xl font-serif font-bold text-slate-900 mb-2">Kalliste</h1>
                  <p className="text-sm text-slate-500 mb-8 tracking-widest uppercase font-bold">Yönetim Paneli</p>
                  <form onSubmit={(e)=>{e.preventDefault(); if(accessInput===APP_ACCESS_CODE){setIsAppUnlocked(true); sessionStorage.setItem('app_unlocked','true');}else{showToast('Hatalı Şifre','error');}}}>
                      <input type="password" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-center text-2xl tracking-[0.5em] font-bold mb-4 outline-none focus:ring-4 focus:ring-amber-100 transition-all" placeholder="••••" value={accessInput} onChange={(e) => setAccessInput(e.target.value)} />
                      <button type="submit" className="w-full py-4 bg-slate-900 text-white font-bold rounded-xl shadow-lg hover:bg-slate-800 transition-transform active:scale-95">GİRİŞ</button>
                  </form>
              </div>
          </div>
      );
  }

  if (authLoading) {
      return (
          <div className="h-screen bg-slate-50 flex items-center justify-center">
              <Loader2 className="animate-spin text-slate-400" size={32}/>
          </div>
      );
  }

  return (
    <div className="flex flex-col h-screen bg-slate-50 font-sans text-slate-900 relative">
      {toast && (<div className={`fixed top-6 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-full shadow-2xl z-[60] text-white font-bold text-sm flex items-center gap-2 animate-in slide-in-from-top-5 ${toast.type==='error'?'bg-rose-600': (toast.type==='warning'?'bg-amber-500':'bg-emerald-600')}`}><span>{toast.type==='error'?<AlertTriangle size={16}/>:<CheckCircle size={16}/>}</span> {toast.message}</div>)}
      {confirmModal && (<div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6"><div className="bg-white w-full max-w-sm p-6 rounded-2xl text-center shadow-2xl animate-in zoom-in-95"><div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4 text-amber-600"><AlertTriangle/></div><h3 className="font-bold text-lg mb-2 text-slate-800">Emin misiniz?</h3><p className="text-sm text-slate-500 mb-6">{confirmModal.message}</p><div className="flex gap-3"><button onClick={()=>setConfirmModal(null)} className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl">Vazgeç</button><button onClick={()=>{confirmModal.onConfirm(); setConfirmModal(null)}} className="flex-1 py-3 bg-slate-900 text-white font-bold rounded-xl">Onayla</button></div></div></div>)}
      
      <div className="h-safe-top bg-white w-full"></div>
      
      {/* Ortak Veri İndikatörü */}
      <div className="absolute top-4 left-4 z-50 flex items-center gap-1.5 bg-emerald-100 text-emerald-800 px-3 py-1.5 rounded-full text-[10px] font-bold shadow-sm border border-emerald-200">
        <Globe size={12}/> <span>CANLI: ORTAK VERİ</span>
      </div>

      <main className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          {activeTab === 'production' && <ProductionView />}
          {activeTab === 'catalog' && <CatalogView />}
          {activeTab === 'materials' && <MaterialsView />}
          {activeTab === 'orders' && <OrdersView />}
          {activeTab === 'finance' && <FinanceView />}
      </main>
      
      <div className="fixed bottom-0 w-full bg-white/95 backdrop-blur-xl border-t border-slate-200 pb-safe-bottom z-40 shadow-[0_-5px_20px_rgba(0,0,0,0.03)]">
          <div className="flex justify-around items-center h-20 px-2">
              <NavBtn id="production" icon={FlaskConical} label="Üretim" active={activeTab} set={setActiveTab} />
              <NavBtn id="catalog" icon={Library} label="Katalog" active={activeTab} set={setActiveTab} />
              <NavBtn id="materials" icon={Droplets} label="Hammadde" active={activeTab} set={setActiveTab} />
              <NavBtn id="orders" icon={ShoppingBag} label="Sipariş" active={activeTab} set={setActiveTab} />
              <NavBtn id="finance" icon={Wallet} label="Finans" active={activeTab} set={setActiveTab} />
          </div>
      </div>
    </div>
  );
}

const NavBtn = ({ id, icon: Icon, label, active, set }) => (
    <button onClick={() => set(id)} className={`flex flex-col items-center gap-1.5 p-2 rounded-2xl transition-all duration-300 w-16 ${active === id ? 'text-slate-900 bg-slate-100 -translate-y-2 shadow-lg ring-1 ring-slate-200' : 'text-slate-400 hover:text-slate-600'}`}>
        <Icon size={22} strokeWidth={active === id ? 2.5 : 2} className="transition-transform duration-300" />
        <span className="text-[9px] font-bold tracking-wide">{label}</span>
    </button>
);