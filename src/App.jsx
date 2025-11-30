import React, { useState, useEffect } from 'react';
import { 
  Package, FlaskConical, Library, ShoppingBag, 
  Plus, Trash2, CheckCircle, MapPin, 
  X, Lock, AlertTriangle, TrendingUp, TrendingDown,
  Droplets, Wallet, Loader2, AlertCircle, ArrowRight, Globe, Clock, PenTool, Edit3, Filter, Search, ShoppingCart, Save
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
  onSnapshot,
  getDoc
} from 'firebase/firestore';

// --- INITIALIZATION ---
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

const DATA_NAMESPACE = 'kalliste-tracker-v4';
const APP_ACCESS_CODE = "kalliste25"; 

// --- YARDIMCI FONKSİYONLAR ---
const formatMoney = (amt) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(amt || 0);
const formatDate = (d) => new Date(d).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
const getDaysLeft = (start, duration) => {
    const endDate = new Date(new Date(start).getTime() + (parseInt(duration) * 86400000));
    const diff = endDate - new Date();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

const CategoryBadge = ({ category }) => {
    if (category === 'male') return <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-[10px] font-bold border border-blue-200">M</span>;
    if (category === 'female') return <span className="bg-pink-100 text-pink-700 px-1.5 py-0.5 rounded text-[10px] font-bold border border-pink-200">W</span>;
    return <span className="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded text-[10px] font-bold border border-purple-200">U</span>;
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
        showToast("Giriş yapılamadı.", "error");
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

  // --- DATA SYNC ---
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
                    if (['rawMaterials', 'products'].includes(name)) {
                        items.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
                    } else {
                        items.sort((a, b) => {
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
            (error) => console.error(error)
        );
    });

    return () => unsubs.forEach(u => u());
  }, [user]);

  // --- COMMON ACTIONS ---
  const saveToDb = async (collectionName, data) => {
      if(!db || !user) return;
      try {
          await setDoc(getDocRef(collectionName), { items: data });
      } catch(e) { 
          showToast("Kaydedilemedi!", "error"); 
      }
  };

  const showToast = (message, type='success') => { setToast({message, type}); setTimeout(()=>setToast(null), 3000); };
  const showConfirm = (message, onConfirm) => setConfirmModal({message, onConfirm});

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
    const [form, setForm] = useState({ name: '', quantity: '', duration: '30', ingredients: [], category: 'unisex' });
    const [selIng, setSelIng] = useState('');
    const [selAmount, setSelAmount] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    const productionTargets = [];
    orders.filter(o => o.status === 'needs_production' || o.status === 'partial').forEach(order => {
        const items = order.items || [{ product: order.product, quantity: order.quantity, status: order.status }];
        items.forEach(item => {
            if (item.status === 'needs_production' || !item.status) {
                const existing = productionTargets.find(t => t.name === item.product);
                if(existing) {
                    existing.totalNeeded += parseInt(item.quantity);
                    existing.orderCount += 1;
                } else {
                    productionTargets.push({ name: item.product, totalNeeded: parseInt(item.quantity), orderCount: 1 });
                }
            }
        });
    });

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

        if(stockError) { showToast('Yetersiz Hammadde!', 'error'); return; }

        setRawMaterials(newRaw);
        saveToDb('rawMaterials', newRaw);

        const newBatch = { 
            id: `PRD-${Math.floor(Math.random()*10000)}`, 
            name: form.name, 
            quantity: parseInt(form.quantity), 
            startDate: new Date().toISOString(), 
            duration: parseInt(form.duration), 
            status: 'macerating',
            ingredients: form.ingredients,
            category: form.category || 'unisex'
        };
        const updatedBatches = [newBatch, ...batches];
        setBatches(updatedBatches);
        saveToDb('batches', updatedBatches);

        const updatedOrders = orders.map(order => {
            let orderModified = false;
            const items = order.items || [{ product: order.product, quantity: order.quantity, status: order.status }];
            const newItems = items.map(item => {
                if ((item.status === 'needs_production' || !item.status) && item.product === form.name) {
                    orderModified = true;
                    return { ...item, status: 'waiting' };
                }
                return item;
            });
            if (orderModified) {
                const allOk = newItems.every(i => i.status === 'reserved' || i.status === 'waiting');
                return { ...order, items: newItems, status: allOk ? 'waiting' : 'partial' };
            }
            return order;
        });
        
        setOrders(updatedOrders);
        saveToDb('orders', updatedOrders);

        showToast(`${form.quantity} adet ${form.name} üretime alındı.`);
        setIsNew(false);
    };

    const handleQuickProduce = (targetName, targetQty) => {
        const existingProd = products.find(p => p.name === targetName);
        setForm({ 
            name: targetName, 
            quantity: targetQty, 
            duration: '30', 
            ingredients: [],
            category: existingProd ? existingProd.category : 'unisex'
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
                newProducts = [...products, { 
                    id: Date.now(), 
                    name: batch.name, 
                    stock: batch.quantity, 
                    price: 0, 
                    size: '50ml',
                    category: batch.category || 'unisex'
                }];
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
        showToast('Güncellendi!');
    };

    const handleDeleteBatch = (id) => {
        showConfirm('Bu üretim kaydı silinsin mi?', () => {
            const newBatches = batches.filter(b => b.id !== id);
            setBatches(newBatches);
            saveToDb('batches', newBatches);
        });
    };

    const filteredBatches = batches.filter(b => b.status === 'macerating' && b.name.toLowerCase().includes(searchTerm.toLowerCase()));

    return (
        <div className="space-y-4 pb-24">
             <div className="flex justify-between items-center px-1">
                <h2 className="text-2xl font-bold text-slate-800">Üretim</h2>
                <div className="flex gap-2">
                    <div className="relative">
                        <input className="pl-8 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs w-32 focus:w-40 transition-all" placeholder="Ara..." value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} />
                        <Search className="absolute left-2.5 top-2.5 text-slate-400" size={14}/>
                    </div>
                    <button onClick={()=>{
                        setForm({ name: '', quantity: '', duration: '30', ingredients: [], category: 'unisex' });
                        setIsNew(true);
                    }} className="bg-slate-900 text-white px-3 rounded-xl shadow-lg hover:bg-slate-800"><Plus size={20}/></button>
                </div>
             </div>

            {productionTargets.length > 0 && (
                <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4">
                    <div className="flex items-center gap-2 text-rose-700 mb-3">
                        <AlertCircle size={20} />
                        <h3 className="font-bold text-sm uppercase">Acil Üretim Hedefleri</h3>
                    </div>
                    <div className="space-y-2">
                        {productionTargets.map((target, idx) => (
                            <div key={idx} className="bg-white p-3 rounded-xl border border-rose-100 flex justify-between items-center shadow-sm">
                                <div>
                                    <div className="font-bold text-slate-800">{target.name}</div>
                                    <div className="text-xs text-rose-500 font-bold">{target.totalNeeded} adet eksik</div>
                                </div>
                                <button onClick={() => handleQuickProduce(target.name, target.totalNeeded)} className="bg-rose-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1">
                                    Üret <ArrowRight size={12}/>
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

             <div className="grid gap-3">
                {filteredBatches.map(batch => {
                    const daysLeft = getDaysLeft(batch.startDate, batch.duration);
                    const progress = Math.min(100, Math.max(0, 100 - (daysLeft / batch.duration * 100)));
                    const isReady = daysLeft <= 0;

                    return (
                        <div key={batch.id} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden group">
                            <div className="flex justify-between items-start mb-2 relative z-10">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-slate-400 font-bold tracking-wider">{batch.id}</span>
                                        <CategoryBadge category={batch.category} />
                                        <button onClick={()=>setEditBatch(batch)} className="text-slate-300 hover:text-indigo-500 transition-colors ml-2"><Edit3 size={12}/></button>
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

                            {isReady && (
                                <button onClick={()=>handleBottle(batch)} className="w-full py-3 bg-slate-900 text-white font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors">
                                    <Package size={18}/> Şişele ve Stoğa Ekle
                                </button>
                            )}
                        </div>
                    );
                })}
                {filteredBatches.length === 0 && productionTargets.length === 0 && (
                    <div className="text-center text-slate-400 py-10">Aktif üretim yok.</div>
                )}
             </div>

             {/* MODALS */}
             {editBatch && (
                <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white w-full max-w-sm rounded-2xl p-6 space-y-3 animate-in zoom-in-95">
                        <div className="flex justify-between items-center border-b pb-2">
                            <h3 className="font-bold text-lg">Üretim Düzenle</h3>
                            <button onClick={()=>setEditBatch(null)}><X size={20}/></button>
                        </div>
                        <div className="space-y-3">
                            <input className="w-full p-3 bg-slate-50 border rounded-xl" value={editBatch.name} onChange={e=>setEditBatch({...editBatch, name:e.target.value})} />
                            <div className="flex gap-3">
                                <input type="number" className="flex-1 p-3 bg-slate-50 border rounded-xl" value={editBatch.quantity} onChange={e=>setEditBatch({...editBatch, quantity:parseInt(e.target.value)})} />
                                <input type="number" className="flex-1 p-3 bg-slate-50 border rounded-xl" value={editBatch.duration} onChange={e=>setEditBatch({...editBatch, duration:parseInt(e.target.value)})} />
                            </div>
                        </div>
                        <button onClick={handleUpdateBatch} className="w-full py-3 bg-slate-900 text-white font-bold rounded-xl">Kaydet</button>
                    </div>
                </div>
             )}

             {isNew && (
                 <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
                     <div className="bg-white w-full max-w-md rounded-2xl p-6 space-y-4 animate-in slide-in-from-bottom-10 max-h-[85vh] overflow-y-auto">
                        <div className="flex justify-between items-center border-b pb-4">
                            <h3 className="font-bold text-lg">Yeni Üretim</h3>
                            <button onClick={()=>setIsNew(false)}><X size={20}/></button>
                        </div>
                        
                        <input className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium" placeholder="Parfüm Adı" value={form.name} onChange={e=>setForm({...form, name:e.target.value})} />
                        
                        <div className="flex gap-2">
                            {['male', 'female', 'unisex'].map(cat => (
                                <button key={cat} onClick={() => setForm({...form, category: cat})} className={`flex-1 py-2 rounded-xl text-xs font-bold border ${form.category === cat ? 'bg-slate-900 text-white' : 'bg-white text-slate-500'}`}>
                                    {cat === 'male' ? 'M' : cat === 'female' ? 'W' : 'U'}
                                </button>
                            ))}
                        </div>

                        <div className="flex gap-3">
                            <input type="number" className="flex-1 p-3 bg-slate-50 border rounded-xl" placeholder="Adet" value={form.quantity} onChange={e=>setForm({...form, quantity:e.target.value})} />
                            <input type="number" className="flex-1 p-3 bg-slate-50 border rounded-xl" placeholder="Süre (Gün)" value={form.duration} onChange={e=>setForm({...form, duration:e.target.value})} />
                        </div>

                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                            <div className="flex gap-2 mb-3">
                                <select className="flex-1 p-2 border rounded-lg text-sm" value={selIng} onChange={e=>setSelIng(e.target.value)}>
                                    <option value="">Malzeme...</option>
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
                            </div>
                        </div>

                        <button onClick={handleStartProduction} className="w-full py-4 bg-slate-900 text-white font-bold rounded-xl shadow-xl">Başlat</button>
                     </div>
                 </div>
             )}
        </div>
    );
  };

  // --- 4. BÖLÜM: KATALOG ---
  const CatalogView = () => {
    const [editProd, setEditProd] = useState(null);
    const [filterCats, setFilterCats] = useState(['male', 'female', 'unisex']);
    const [searchTerm, setSearchTerm] = useState('');

    const toggleFilter = (cat) => {
        if (filterCats.includes(cat) && filterCats.length > 1) {
            setFilterCats(filterCats.filter(c => c !== cat));
        } else if (!filterCats.includes(cat)) {
            setFilterCats([...filterCats, cat]);
        }
    };

    const filteredProducts = products.filter(p => 
        filterCats.includes(p.category || 'unisex') && 
        p.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleSell = (prod) => {
        showConfirm(`${prod.name} satışı yapılsın mı?`, () => {
             const newProds = products.map(p => p.id === prod.id ? { ...p, stock: p.stock - 1 } : p);
             setProducts(newProds);
             saveToDb('products', newProds);
             if(prod.price > 0) addTransaction('income', `${prod.name} Satışı`, prod.price);
             showToast('Satıldı.');
        });
    };

    const handleUpdateProduct = () => {
        const newProds = products.map(p => p.id === editProd.id ? editProd : p);
        setProducts(newProds);
        saveToDb('products', newProds);
        setEditProd(null);
        showToast('Güncellendi!');
    };

    const handleDeleteProduct = (id) => {
        showConfirm('Silinsin mi?', () => {
            const newProds = products.filter(p => p.id !== id);
            setProducts(newProds);
            saveToDb('products', newProds);
        });
    };

    return (
        <div className="space-y-4 pb-24">
            <div className="flex justify-between items-center px-1 gap-2">
                <div className="flex gap-2 flex-1">
                    <div className="relative flex-1">
                        <input className="pl-8 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs w-full" placeholder="Ara..." value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} />
                        <Search className="absolute left-2.5 top-2.5 text-slate-400" size={14}/>
                    </div>
                </div>
                <div className="flex bg-white rounded-lg p-1 border border-slate-200">
                    {['male', 'female', 'unisex'].map(cat => (
                        <button key={cat} onClick={() => toggleFilter(cat)} className={`px-2 py-1 rounded text-[10px] font-bold ${filterCats.includes(cat) ? 'bg-slate-900 text-white' : 'text-slate-400'}`}>
                            {cat === 'male' ? 'M' : cat === 'female' ? 'W' : 'U'}
                        </button>
                    ))}
                </div>
            </div>
            
            <div className="grid gap-3">
                {filteredProducts.map(p => (
                    <div key={p.id} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex flex-col gap-3">
                        <div className="flex justify-between items-start">
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <h3 className="font-bold text-lg text-slate-800">{p.name}</h3>
                                    <CategoryBadge category={p.category} />
                                </div>
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
                            <button onClick={()=>handleSell(p)} disabled={p.stock<=0} className="flex-1 py-2 bg-slate-900 text-white rounded-lg text-sm font-bold disabled:opacity-50">Satış Yap</button>
                            <button onClick={()=>setEditProd(p)} className="px-3 bg-slate-100 text-slate-600 rounded-lg"><Edit3 size={16}/></button>
                            <button onClick={()=>handleDeleteProduct(p.id)} className="px-3 bg-rose-100 text-rose-600 rounded-lg"><Trash2 size={16}/></button>
                        </div>
                    </div>
                ))}
            </div>

            {editProd && (
                 <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
                     <div className="bg-white w-full max-w-sm rounded-2xl p-6 space-y-4 animate-in zoom-in-95">
                        <div className="flex justify-between items-center border-b pb-2">
                            <h3 className="font-bold text-lg">Ürün Düzenle</h3>
                            <button onClick={()=>setEditProd(null)}><X size={20}/></button>
                        </div>
                        
                        <input className="w-full p-3 bg-slate-50 border rounded-xl" value={editProd.name} onChange={e=>setEditProd({...editProd, name:e.target.value})} />
                        
                        <select className="w-full p-3 bg-slate-50 border rounded-xl" value={editProd.category || 'unisex'} onChange={e=>setEditProd({...editProd, category:e.target.value})}>
                            <option value="male">Erkek (M)</option>
                            <option value="female">Kadın (W)</option>
                            <option value="unisex">Unisex (U)</option>
                        </select>

                        <div className="flex gap-3">
                            <input type="number" className="flex-1 p-3 bg-slate-50 border rounded-xl" value={editProd.stock} onChange={e=>setEditProd({...editProd, stock:parseInt(e.target.value)})} />
                            <input type="number" className="flex-1 p-3 bg-slate-50 border rounded-xl" value={editProd.price} onChange={e=>setEditProd({...editProd, price:parseFloat(e.target.value)})} />
                        </div>

                        <button onClick={handleUpdateProduct} className="w-full py-3 bg-slate-900 text-white font-bold rounded-xl">Kaydet</button>
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
    const [searchTerm, setSearchTerm] = useState('');

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
        showConfirm('Silinsin mi?', () => {
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
        showToast('Güncellendi!');
    };

    const filteredMaterials = rawMaterials.filter(m => m.name.toLowerCase().includes(searchTerm.toLowerCase()));

    return (
        <div className="space-y-4 pb-24">
            <div className="flex justify-between items-center px-1">
                <h2 className="text-2xl font-bold text-slate-800">Hammaddeler</h2>
                <div className="flex gap-2">
                    <div className="relative">
                        <input className="pl-8 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs w-32" placeholder="Ara..." value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} />
                        <Search className="absolute left-2.5 top-2.5 text-slate-400" size={14}/>
                    </div>
                    <button onClick={()=>setIsAdd(true)} className="bg-slate-900 text-white px-3 rounded-xl"><Plus size={20}/></button>
                </div>
            </div>

            {isAdd && (
                <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-sm rounded-2xl p-6 space-y-3">
                        <h3 className="font-bold">Yeni Malzeme</h3>
                        <input className="w-full p-2 border rounded-lg" placeholder="Adı" value={form.name} onChange={e=>setForm({...form, name:e.target.value})} />
                        <div className="flex gap-2">
                            <input className="flex-1 p-2 border rounded-lg" type="number" placeholder="Miktar" value={form.quantity} onChange={e=>setForm({...form, quantity:e.target.value})} />
                            <select className="p-2 border rounded-lg" value={form.unit} onChange={e=>setForm({...form, unit:e.target.value})}>
                                <option value="ml">ml</option>
                                <option value="gr">gr</option>
                                <option value="adet">adet</option>
                            </select>
                        </div>
                        <input className="w-full p-2 border rounded-lg" type="number" placeholder="Min Stok" value={form.minStock} onChange={e=>setForm({...form, minStock:e.target.value})} />
                        <input className="w-full p-2 border rounded-lg" type="number" placeholder="Maliyet (TL)" value={form.cost} onChange={e=>setForm({...form, cost:e.target.value})} />
                        <button onClick={handleSave} className="w-full py-3 bg-slate-900 text-white font-bold rounded-xl">Kaydet</button>
                        <button onClick={()=>setIsAdd(false)} className="w-full py-2 bg-slate-100 rounded-xl">İptal</button>
                    </div>
                </div>
            )}

            <div className="grid gap-3">
                {filteredMaterials.map(m => (
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
                            <button onClick={()=>setEditMaterial(m)} className="p-2 text-slate-400"><Edit3 size={16}/></button>
                            <button onClick={()=>handleDelete(m.id)} className="p-2 text-rose-300"><Trash2 size={16}/></button>
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
                        <input className="w-full p-2 border rounded-lg" value={editMaterial.name} onChange={e=>setEditMaterial({...editMaterial, name:e.target.value})} />
                        <div className="flex gap-2">
                            <input className="flex-1 p-2 border rounded-lg" type="number" value={editMaterial.quantity} onChange={e=>setEditMaterial({...editMaterial, quantity:parseFloat(e.target.value)})} />
                            <select className="p-2 border rounded-lg" value={editMaterial.unit} onChange={e=>setEditMaterial({...editMaterial, unit:e.target.value})}>
                                <option value="ml">ml</option>
                                <option value="gr">gr</option>
                                <option value="adet">adet</option>
                            </select>
                        </div>
                        <input className="w-full p-2 border rounded-lg" type="number" placeholder="Min Stok" value={editMaterial.minStock} onChange={e=>setEditMaterial({...editMaterial, minStock:parseFloat(e.target.value)})} />
                        <button onClick={handleUpdateMaterial} className="w-full py-3 bg-slate-900 text-white font-bold rounded-xl">Kaydet</button>
                    </div>
                </div>
            )}
        </div>
    );
  };

  // --- 6. BÖLÜM: SİPARİŞLER (YENİ SEPET MANTIĞI) ---
  const OrdersView = () => {
    const [isAdd, setIsAdd] = useState(false);
    const [isManualInput, setIsManualInput] = useState(false);
    const [editingOrder, setEditingOrder] = useState(null); // YENİ: Sipariş Düzenleme Modu
    
    // YENİ: Sepet Mantığı
    const [basket, setBasket] = useState([]);
    const [customerName, setCustomerName] = useState('');
    const [newItem, setNewItem] = useState({ product: '', quantity: 1 });
    
    const [searchTerm, setSearchTerm] = useState('');

    // DÜZENLEME MODUNU BAŞLAT
    const openEditOrder = (order) => {
        setEditingOrder({
            ...order,
            // Eski verilerde 'items' olmayabilir, uyumluluk sağla
            items: order.items || [{ product: order.product, quantity: order.quantity, status: order.status }]
        });
    };

    const saveEditedOrder = () => {
        if (!editingOrder) return;

        // Stok ayarlamalarını yap (Zor ve riskli olduğu için şimdilik sadece kaydı güncelliyoruz)
        // Gelişmiş versiyonda: Eski siparişin rezerve miktarını stoğa iade et, yeni siparişinkini düş.
        // Şimdilik basitçe kaydı güncelleyelim.
        
        // Siparişteki her bir kalemin durumunu tekrar kontrol et (Belki stok durumu değişmiştir)
        const updatedItems = editingOrder.items.map(item => {
            const product = products.find(p => p.name === item.product);
            const activeBatch = batches.find(b => b.name === item.product && b.status === 'macerating');
            
            let status = 'needs_production';
            // Not: Stok kontrolü yaparken mevcut stok + bu siparişin zaten tuttuğu stok hesaba katılmalı
            // Bu karmaşık olduğu için şimdilik basit statü kontrolü yapıyoruz.
            if (product && product.stock >= parseInt(item.quantity)) status = 'reserved';
            else if (activeBatch) status = 'waiting';
            
            return { ...item, status };
        });

        const updatedOrder = {
            ...editingOrder,
            items: updatedItems,
            // Genel durumu güncelle
            status: updatedItems.some(i => i.status === 'needs_production') ? 'needs_production' : 
                    updatedItems.some(i => i.status === 'waiting') ? 'waiting' : 'reserved'
        };

        const newOrders = orders.map(o => o.id === updatedOrder.id ? updatedOrder : o);
        setOrders(newOrders);
        saveToDb('orders', newOrders);
        setEditingOrder(null);
        showToast('Sipariş güncellendi.');
    };

    const removeOrderItem = (itemIndex) => {
        if (!editingOrder) return;
        const newItems = [...editingOrder.items];
        const removedItem = newItems.splice(itemIndex, 1)[0];
        
        // Eğer silinen ürün 'reserved' ise stoğa geri ekle
        if (removedItem.status === 'reserved') {
            const productIndex = products.findIndex(p => p.name === removedItem.product);
            if (productIndex > -1) {
                const newProducts = [...products];
                newProducts[productIndex].stock += parseInt(removedItem.quantity);
                setProducts(newProducts);
                saveToDb('products', newProducts);
                showToast(`${removedItem.product} stoğa iade edildi.`);
            }
        }

        setEditingOrder({ ...editingOrder, items: newItems });
    };

    const updateOrderItemQty = (index, newQty) => {
        const newItems = [...editingOrder.items];
        const oldQty = parseInt(newItems[index].quantity);
        const diff = parseInt(newQty) - oldQty;
        
        // Stok yönetimi (Basitleştirilmiş)
        if (newItems[index].status === 'reserved') {
            const productIndex = products.findIndex(p => p.name === newItems[index].product);
            if (productIndex > -1) {
                // Eğer miktar arttıysa stoktan düş, azaldıysa stoğa ekle
                const currentStock = products[productIndex].stock;
                if (currentStock >= diff) {
                    const newProducts = [...products];
                    newProducts[productIndex].stock -= diff;
                    setProducts(newProducts);
                    saveToDb('products', newProducts);
                } else {
                    showToast('Yetersiz stok!', 'error');
                    return; // İşlemi iptal et
                }
            }
        }
        
        newItems[index].quantity = newQty;
        setEditingOrder({ ...editingOrder, items: newItems });
    };

    // --- MEVCUT FONKSİYONLAR ---
    const handleAddToBasket = () => {
        if(!newItem.product) return;
        const product = products.find(p => p.name === newItem.product);
        const activeBatch = batches.find(b => b.name === newItem.product && b.status === 'macerating');
        let status = 'needs_production';
        if (product && product.stock >= parseInt(newItem.quantity)) status = 'reserved';
        else if (activeBatch) status = 'waiting';
        setBasket([...basket, { ...newItem, status, id: Date.now() }]);
        setNewItem({ product: '', quantity: 1 });
        setIsManualInput(false);
    };

    const handleSaveOrder = () => {
        if(basket.length === 0 || !customerName) return;
        let updatedProducts = [...products];
        basket.forEach(item => {
            if(item.status === 'reserved') {
                const prodIndex = updatedProducts.findIndex(p => p.name === item.product);
                if(prodIndex > -1) {
                    updatedProducts[prodIndex] = {
                        ...updatedProducts[prodIndex],
                        stock: updatedProducts[prodIndex].stock - parseInt(item.quantity)
                    };
                }
            }
        });
        setProducts(updatedProducts);
        saveToDb('products', updatedProducts);
        let mainStatus = 'reserved';
        if(basket.some(i => i.status === 'needs_production')) mainStatus = 'needs_production';
        else if(basket.some(i => i.status === 'waiting')) mainStatus = 'waiting';
        const newOrder = {
            id: Date.now(),
            customer: customerName,
            items: basket,
            status: mainStatus,
            date: new Date().toISOString(),
            note: `${basket.length} kalem ürün`
        };
        const newOrders = [newOrder, ...orders];
        setOrders(newOrders);
        saveToDb('orders', newOrders);
        showToast('Sipariş oluşturuldu.');
        setIsAdd(false); setBasket([]); setCustomerName('');
    };

    const handleDeliver = (order) => {
        showConfirm('Teslim edildi mi?', () => {
            const items = order.items || [{ product: order.product, quantity: order.quantity }];
            let totalAmount = 0;
            items.forEach(item => {
                const prod = products.find(p => p.name === item.product);
                if(prod) totalAmount += (prod.price * item.quantity);
            });
            if(totalAmount > 0) addTransaction('income', `Teslimat: ${order.customer}`, totalAmount);
            const updatedOrders = orders.map(o => o.id === order.id ? { ...o, status: 'completed' } : o);
            setOrders(updatedOrders);
            saveToDb('orders', updatedOrders);
            showToast('Teslim edildi!');
        });
    };

    const handleDeleteOrder = (id) => {
        showConfirm('Sipariş silinsin mi?', () => {
            const newOrders = orders.filter(o => o.id !== id);
            setOrders(newOrders);
            saveToDb('orders', newOrders);
        });
    };

    const filteredOrders = orders.filter(o => 
        o.status !== 'completed' && 
        o.customer.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-4 pb-24">
            <div className="flex justify-between items-center px-1">
                <h2 className="text-2xl font-bold text-slate-800">Siparişler</h2>
                <div className="flex gap-2">
                    <div className="relative">
                        <input className="pl-8 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs w-32" placeholder="Ara..." value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} />
                        <Search className="absolute left-2.5 top-2.5 text-slate-400" size={14}/>
                    </div>
                    <button onClick={()=>setIsAdd(true)} className="bg-slate-900 text-white px-3 rounded-xl"><Plus size={20}/></button>
                </div>
            </div>

            {/* SİPARİŞ LİSTESİ */}
            <div className="grid gap-3">
                {filteredOrders.map(o => (
                    <div key={o.id} className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col gap-2 relative group">
                        <div className="flex justify-between items-start">
                            <div className="font-bold text-slate-800">{o.customer}</div>
                            {/* DÜZENLEME VE SİLME BUTONLARI */}
                            <div className="flex gap-1">
                                <button onClick={()=>openEditOrder(o)} className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100"><Edit3 size={16}/></button>
                                <button onClick={()=>handleDeliver(o)} className="p-1.5 bg-emerald-100 text-emerald-600 rounded-lg hover:bg-emerald-200"><CheckCircle size={16}/></button>
                                <button onClick={()=>handleDeleteOrder(o.id)} className="p-1.5 bg-rose-100 text-rose-600 rounded-lg hover:bg-rose-200"><Trash2 size={16}/></button>
                            </div>
                        </div>
                        
                        <div className="space-y-1">
                            {(o.items || [{product:o.product, quantity:o.quantity, status:o.status}]).map((item, i) => (
                                <div key={i} className="flex justify-between text-sm border-b border-slate-50 pb-1 last:border-0">
                                    <span className="text-slate-600">{item.product} x{item.quantity}</span>
                                    {item.status === 'reserved' && <span className="text-[10px] font-bold text-emerald-500 bg-emerald-50 px-1 rounded">Rezerve</span>}
                                    {item.status === 'waiting' && <span className="text-[10px] font-bold text-amber-500 bg-amber-50 px-1 rounded">Bekliyor</span>}
                                    {(item.status === 'needs_production' || !item.status) && <span className="text-[10px] font-bold text-rose-500 bg-rose-50 px-1 rounded">Üretilmeli</span>}
                                </div>
                            ))}
                        </div>
                        <div className="text-xs text-slate-400 italic text-right">{formatDate(o.date)}</div>
                    </div>
                ))}
            </div>

            {/* SİPARİŞ DÜZENLEME MODALI */}
            {editingOrder && (
                <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white w-full max-w-md rounded-2xl p-6 space-y-4 animate-in zoom-in-95">
                        <div className="flex justify-between items-center border-b pb-2">
                            <h3 className="font-bold text-lg">Siparişi Düzenle</h3>
                            <button onClick={()=>setEditingOrder(null)}><X size={20} className="text-slate-400"/></button>
                        </div>
                        
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Müşteri</label>
                            <input 
                                className="w-full p-2 border rounded-lg mt-1 font-bold" 
                                value={editingOrder.customer} 
                                onChange={e=>setEditingOrder({...editingOrder, customer:e.target.value})} 
                            />
                        </div>

                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                            <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">Sepet İçeriği</label>
                            {editingOrder.items.map((item, idx) => (
                                <div key={idx} className="flex justify-between items-center bg-white p-2 rounded shadow-sm mb-2 text-sm">
                                    <span className="font-medium">{item.product}</span>
                                    <div className="flex items-center gap-2">
                                        <input 
                                            type="number" 
                                            className="w-12 p-1 border rounded text-center" 
                                            value={item.quantity}
                                            onChange={(e) => updateOrderItemQty(idx, e.target.value)}
                                        />
                                        <button onClick={() => removeOrderItem(idx)} className="text-rose-400 p-1 hover:bg-rose-50 rounded">
                                            <Trash2 size={14}/>
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {editingOrder.items.length === 0 && <div className="text-center text-xs text-rose-500">Sepet boş, sipariş silinebilir.</div>}
                        </div>

                        <button onClick={saveEditedOrder} className="w-full py-3 bg-slate-900 text-white font-bold rounded-xl shadow-lg">Değişiklikleri Kaydet</button>
                    </div>
                </div>
            )}

            {/* YENİ SİPARİŞ MODALI (ESKİSİ İLE AYNI) */}
            {isAdd && (
                <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-md rounded-2xl p-6 space-y-4 max-h-[85vh] overflow-y-auto">
                        <div className="flex justify-between items-center border-b pb-4">
                            <h3 className="font-bold text-lg">Yeni Sipariş Oluştur</h3>
                            <button onClick={()=>setIsAdd(false)}><X size={20}/></button>
                        </div>
                        
                        <input className="w-full p-3 border rounded-xl font-bold" placeholder="Müşteri Adı" value={customerName} onChange={e=>setCustomerName(e.target.value)} />
                        
                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 min-h-[100px]">
                            {basket.length === 0 ? <div className="text-center text-slate-400 text-sm py-4">Sepet boş</div> : (
                                <div className="space-y-2">
                                    {basket.map((item, idx) => (
                                        <div key={item.id} className="flex justify-between items-center bg-white p-2 rounded shadow-sm text-sm">
                                            <span>{item.product} <span className="text-slate-400">x{item.quantity}</span></span>
                                            <div className="flex items-center gap-2">
                                                {item.status === 'reserved' ? <span className="text-[10px] bg-emerald-100 text-emerald-600 px-1 rounded">Stokta</span> : <span className="text-[10px] bg-rose-100 text-rose-600 px-1 rounded">Yok</span>}
                                                <button onClick={()=>setBasket(basket.filter(b=>b.id!==item.id))} className="text-rose-400"><X size={14}/></button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="flex gap-2">
                            {isManualInput ? (
                                <input 
                                    className="flex-1 p-2 border rounded-lg bg-indigo-50 animate-in fade-in" 
                                    placeholder="Özel Ürün Adı..." 
                                    value={newItem.product} 
                                    onChange={e=>setNewItem({...newItem, product:e.target.value})} 
                                />
                            ) : (
                                <select className="flex-1 p-2 border rounded-lg text-sm" value={newItem.product} onChange={e=>setNewItem({...newItem, product:e.target.value})}>
                                    <option value="">Ürün Seç...</option>
                                    {products.map((p,i)=><option key={i} value={p.name}>{p.name}</option>)}
                                </select>
                            )}
                            <button onClick={()=>setIsManualInput(!isManualInput)} className="p-2 bg-slate-100 rounded-lg text-slate-500">
                                {isManualInput ? <ShoppingCart size={18}/> : <PenTool size={18}/>}
                            </button>
                        </div>
                        <div className="flex gap-2">
                            <input type="number" className="w-20 p-2 border rounded-lg" value={newItem.quantity} onChange={e=>setNewItem({...newItem, quantity:e.target.value})} />
                            <button onClick={handleAddToBasket} className="flex-1 bg-indigo-100 text-indigo-700 font-bold rounded-lg hover:bg-indigo-200">Sepete Ekle</button>
                        </div>

                        <button onClick={handleSaveOrder} disabled={basket.length===0} className="w-full py-4 bg-slate-900 text-white font-bold rounded-xl shadow-lg disabled:opacity-50">Siparişi Tamamla</button>
                    </div>
                </div>
            )}
        </div>
    );
  };

  // --- 7. BÖLÜM: FİNANS ---
  const FinanceView = () => {
      const [showAll, setShowAll] = useState(false);
      const income = transactions.filter(t => t.type === 'income').reduce((a,b)=>a+b.amount, 0);
      const expense = transactions.filter(t => t.type === 'expense').reduce((a,b)=>a+b.amount, 0);
      const profit = income - expense;

      const handleDeleteTransaction = (id) => {
          showConfirm('Silinsin mi?', () => {
              const newTransactions = transactions.filter(t => t.id !== id);
              setTransactions(newTransactions);
              saveToDb('transactions', newTransactions);
          });
      };

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
                  <div className="flex justify-between items-center mb-3 px-1">
                      <h3 className="text-xs font-bold text-slate-400 uppercase">Hareketler</h3>
                      {transactions.length > 10 && (
                          <button onClick={() => setShowAll(!showAll)} className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors">
                              {showAll ? 'Kısalt' : 'Tümünü Göster'}
                          </button>
                      )}
                  </div>
                  <div className="space-y-3">
                      {(showAll ? transactions : transactions.slice(0, 10)).map(t => (
                          <div key={t.id} className="bg-white p-3 rounded-xl border border-slate-100 flex justify-between items-center text-sm group">
                              <div>
                                  <div className="font-bold text-slate-700">{t.desc}</div>
                                  <div className="text-xs text-slate-400">{formatDate(t.date)}</div>
                              </div>
                              <div className="flex items-center gap-3">
                                  <div className={`font-bold ${t.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                      {t.type === 'income' ? '+' : '-'}{formatMoney(t.amount)}
                                  </div>
                                  <button onClick={() => handleDeleteTransaction(t.id)} className="p-1 text-slate-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100">
                                      <Trash2 size={14} />
                                  </button>
                              </div>
                          </div>
                      ))}
                  </div>
              </div>
          </div>
      );
  };

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