import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, updateProfile, signOut } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, onSnapshot, collection, query, where, arrayUnion, updateDoc, writeBatch, deleteDoc } from 'firebase/firestore';

// --- CONFIGURAZIONE FIREBASE GLOBALE (TUA) ---
const firebaseConfig = {
  apiKey: "AIzaSyALMoiyVGzHEesU6L5ax2T7Iovg_Zs6kwA",
  authDomain: "mensa-ufficio-2025.firebaseapp.com",
  projectId: "mensa-ufficio-2025",
  storageBucket: "mensa-ufficio-2025.firebasestorage.app",
  messagingSenderId: "792389436556",
  appId: "1:792389436556:web:47cf9c9636ff2d801ee7a9"
};

// --- AGGIUNGI QUESTE DUE RIGHE SOTTO LA CONFIGURAZIONE ---
const appId = 'mensa-app-v1'; 
const initialAuthToken = null;

// Percorsi Firestore
const PUBLIC_DATA_PATH = `artifacts/${appId}/public/data`;
const PUBLIC_ORDERS_COLLECTION = `${PUBLIC_DATA_PATH}/mealOrders`;
const CONFIG_DOC_PATH = `${PUBLIC_DATA_PATH}/config`;
const SETTINGS_DOC_PATH = `${PUBLIC_DATA_PATH}/settings`;
const HOLIDAYS_DOC_PATH = `${CONFIG_DOC_PATH}/holidays`; // Percorso corretto


const BANNER_IMAGE_URL = "https://images.unsplash.com/photo-1559339352-11d035aa65de?q=80&w=2074&auto=format&fit=crop";
const LOGIN_BG_URL = "https://images.unsplash.com/photo-1504674900247-0877df9cc836?q=80&w=2070&auto=format&fit=crop"; // Sfondo cibo verde/fresco

// --- 👥 LISTA COLLEGHI UFFICIALE (GESTITA DA CODICE) ---
const COLLEAGUES_LIST = [
    { id: 'u1', name: 'Barbara Zucchi', email: 'b.zucchi@comune.formigine.mo.it', pin: '1111', isAdmin: false },
    { id: 'u2', name: 'Chiara Italiani', email: 'c_italiani@comune.formigine.mo.it', pin: '2222', isAdmin: false },
    { id: 'u3', name: 'Davide Cremaschi', email: 'd.cremaschi@comune.formigine.mo.it', pin: '3333', isAdmin: false },
    { id: 'u4', name: 'Federica Fontana', email: 'f.fontana@comune.formigine.mo.it', pin: '4444', isAdmin: false },
    { id: 'u5', name: 'Gioacchino Battaglia', email: 'gioacchino.battaglia@comune.formigine.mo.it', pin: '7378', isAdmin: true }, // ADMIN
    { id: 'u6', name: 'Giuseppe Carteri', email: 'g.carteri@comune.formigine.mo.it', pin: '6666', isAdmin: false },
    { id: 'u7', name: 'Andrea Vescogni', email: 'andrea.vescogni@comune.formigine.mo.it', pin: '7777', isAdmin: false },
    { id: 'u8', name: 'Patrizia Caselli', email: 'patrizia.caselli@comune.formigine.mo.it', pin: '8888', isAdmin: false },
    { id: 'u9', name: 'Roberta Falchi', email: 'rfalchi@comune.formigine.mo.it', pin: '9999', isAdmin: false },
    { id: 'u10', name: 'Roberta Palumbo', email: 'r.palumbo@comune.formigine.mo.it', pin: '1234', isAdmin: false },
    { id: 'u11', name: 'Veronica Cantile', email: 'v.cantile@comune.formigine.mo.it', pin: '0000', isAdmin: false },
];

const INITIAL_SETTINGS = {
    emailBar: "gioacchino.battaglia@comune.formigine.mo.it",
    phoneBar: "0598751381"
};

// --- UTILITÀ CALENDARIO ---
const formatDate = (date) => date.toISOString().split('T')[0];

const generateAllowedDates = () => {
    const dates = [];
    const start = new Date('2025-01-01');
    const end = new Date('2026-12-31');
    let current = new Date(start);

    while (current <= end) {
        const day = current.getDay();
        // Lunedì (1) e Giovedì (4)
        if (day === 1 || day === 4) {
            dates.push(formatDate(current));
        }
        current.setDate(current.getDate() + 1);
    }
    return dates;
};

const getNextOpenDay = (todayStr, activeDates) => {
    const sortedDates = [...activeDates].sort();
    return sortedDates.find(d => d > todayStr) || sortedDates[0] || null;
};

const LoadingSpinner = ({ text, onForceStart }) => (
    <div className="flex flex-col items-center justify-center p-4 min-h-[300px]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-4 border-green-700 mb-4"></div>
        <span className="text-gray-500 font-medium">{text || 'Caricamento...'}</span>
        {onForceStart && <button onClick={onForceStart} className="text-xs text-blue-500 underline mt-4">Forza Avvio</button>}
    </div>
);

// --- COMPONENTI UI ---

const ClosedScreen = ({ nextDate }) => {
    let formattedNext = "Presto";
    if (nextDate) {
        try {
            const nextDateObj = new Date(nextDate);
            const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
            formattedNext = nextDateObj.toLocaleDateString('it-IT', options);
        } catch (e) {
            formattedNext = nextDate;
        }
    }

    return (
        <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-lg text-center border-t-8 border-gray-400">
            <div className="mb-6 text-gray-300">
                <svg className="w-20 h-20 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            </div>
            <h1 className="text-3xl font-extrabold text-gray-800 mb-2">😴 Oggi Riposo</h1>
            <p className="text-gray-600 mb-6">
                Le prenotazioni sono chiuse per oggi. Puoi comunque consultare il tuo Storico.
            </p>

            <div className="bg-green-50 p-4 rounded-lg border border-green-200 inline-block w-full mb-6">
                <p className="text-sm text-green-800 font-bold uppercase tracking-wider mb-1">Prossima Apertura</p>
                <p className="text-2xl text-green-900 font-serif capitalize">{formattedNext}</p>
            </div>
        </div>
    );
};

const HelpModal = ({ onClose }) => (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
        <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 relative" onClick={e => e.stopPropagation()}>
            <button onClick={onClose} className="absolute top-4 right-4 text-2xl text-gray-400 hover:text-gray-600">&times;</button>
            <h2 className="text-xl font-bold text-green-800 mb-4">ℹ️ Guida Rapida</h2>
            <div className="space-y-4 text-sm text-gray-600">
                <p>• <strong>Giorni:</strong> Il sistema apre di default **solo i giorni Lunedì e Giovedì**. L'Admin può aprire altri giorni tramite Calendario.</p>
                <p>• <strong>Scadenze:</strong></p>
                <ul className="list-disc pl-5 space-y-2 text-sm text-red-700">
                    <li>**10:30:** Scadenza per salvare l'ordine e per inviare la mail di gruppo.</li>
                    <li>**12:00:** STOP ORDINI. Il modulo si blocca per tutti.</li>
                    <li>**13:00:** STOP EMAIL. L'unico tasto disponibile è "CHIAMA IL BAR".</li>
                </ul>
            </div>
            <button onClick={onClose} className="w-full mt-6 bg-green-600 text-white py-3 rounded-lg font-bold shadow-md hover:bg-green-700">Ho Capito</button>
        </div>
    </div>
);

const WaterIcon = ({ type, selected, onClick }) => {
    let style = 'bg-white border-gray-200 text-gray-400 hover:bg-gray-50';
    if (selected) {
        if (type === 'Frizzante') style = 'bg-blue-50 border-blue-500 text-blue-600 ring-2 ring-blue-200';
        else if (type === 'Naturale') style = 'bg-cyan-50 border-cyan-500 text-cyan-600 ring-2 ring-cyan-200';
        else style = 'bg-gray-100 border-gray-500 text-gray-700';
    }
    return (
        <div onClick={onClick} className={`flex flex-col items-center justify-center p-2 rounded-lg border cursor-pointer h-full transition-all ${style}`}>
            <span className="text-2xl mb-1">{type === 'Naturale' ? '💧' : type === 'Frizzante' ? '🫧' : '🚫'}</span>
            <span className="text-[10px] font-bold uppercase tracking-wide">{type}</span>
        </div>
    );
};

const TypeBtn = ({ type, active, onClick }) => (
    <button onClick={onClick} className={`flex-1 flex flex-col items-center justify-center p-2 rounded-lg border transition-all ${active ? (type==='bar'?'bg-orange-100 border-orange-500 text-orange-700 ring-2 ring-orange-200':'bg-red-50 border-red-500 text-red-700 ring-2 ring-red-200') : 'bg-white border-gray-200 text-gray-400 hover:bg-gray-50'}`}>
        <span className="text-2xl mb-1">{type === 'bar' ? '☕' : '🥡'}</span>
        <span className="text-[10px] font-bold uppercase tracking-wide">{type}</span>
    </button>
);

const LoginScreen = ({ onLogin }) => {
    const [selId, setSelId] = useState('');
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');

    const handleLogin = () => {
        if (!selId) { setError('Seleziona il tuo nome'); return; }
        const user = COLLEAGUES_LIST.find(c => c.id === selId);
        if (user && user.pin === pin) onLogin(user);
        else setError('PIN Errato');
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 relative bg-gray-900 font-sans">
            {/* SFONDO CON IMMAGINE */}
            <div className="absolute inset-0 bg-cover bg-center z-0" style={{ backgroundImage: `url(${LOGIN_BG_URL})`, opacity: 0.6 }}></div>
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent z-0"></div>
            <div className="bg-white/95 backdrop-blur-xl p-8 rounded-3xl shadow-2xl w-full max-w-md border-t-8 border-green-700 relative z-10 animate-fade-in-up">
                <div className="text-center mb-8">
                    <div className="inline-block p-4 bg-green-50 rounded-full shadow-inner border border-green-200 mb-4">
                        <span className="text-4xl">☕</span>
                    </div>
                    <h1 className="text-3xl font-extrabold text-green-900 mb-2 font-serif tracking-tight">7 MILA CAFFÈ</h1>
                    <p className="text-green-700 text-xs italic border-t border-green-200 pt-3 font-medium tracking-wide">
                        "Anche nel caos del lavoro,<br/>il pranzo resta un momento sacro."
                    </p>
                </div>
                <div className="space-y-5">
                    <div className="relative">
                        <span className="absolute left-3 top-3.5 text-gray-400">👤</span>
                        <select className="w-full pl-10 p-3 border-2 border-gray-200 rounded-xl bg-white font-bold text-gray-700 outline-none focus:border-green-500 transition-colors appearance-none" value={selId} onChange={e => setSelId(e.target.value)}>
                            <option value="">Chi sei?</option>
                            {COLLEAGUES_LIST.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                    <div className="relative">
                        <span className="absolute left-3 top-3.5 text-gray-400">🔒</span>
                        <input type="password" placeholder="PIN" maxLength={4} className="w-full pl-10 p-3 border-2 border-gray-200 rounded-xl bg-white text-center font-bold text-xl tracking-widest text-gray-700 outline-none focus:border-green-500 transition-colors" value={pin} onChange={e => setPin(e.target.value)} />
                    </div>
                    {error && <div className="bg-red-50 text-red-600 text-center text-sm font-bold p-3 rounded-lg border border-red-100 animate-pulse">{error}</div>}
                    <button onClick={handleLogin} className="w-full bg-gradient-to-r from-green-700 to-green-600 hover:from-green-800 hover:to-green-700 text-white font-bold py-4 rounded-xl shadow-lg transform transition active:scale-95">ENTRA</button>
                </div>
            </div>
        </div>
    );
};

// --- STATISTICHE BUONI (NON USATO NELLA VERSIONE FINALE) ---
const UserStatsModal = ({ onClose }) => { return null; }; // Componente rimosso per stabilità

// --- COMPONENTE ADMIN: STORICO ORDINI ---
const AdminHistory = ({ db, onClose, user }) => {
    const [selectedDate, setSelectedDate] = useState(formatDate(new Date()));
    const [historyOrders, setHistoryOrders] = useState([]);
    const [historyStatus, setHistoryStatus] = useState('');
    const [historyAuthor, setHistoryAuthor] = useState('');
    const [loadingHistory, setLoadingHistory] = useState(false);

    const loadHistory = async (dateStr) => {
        setLoadingHistory(true);
        try {
            const docRef = doc(db, PUBLIC_ORDERS_COLLECTION, dateStr);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists() && docSnap.data().status === 'sent') { 
                const rawOrders = docSnap.data().orders || [];
                const sorted = rawOrders.sort((a, b) => a.userName.localeCompare(b.userName));
                setHistoryOrders(sorted);
                setHistoryStatus(docSnap.data().status || 'open');
                setHistoryAuthor(docSnap.data().confirmedBy || '');
            } else {
                setHistoryOrders([]);
                setHistoryStatus('Nessun ordine trovato o non inviato');
                setHistoryAuthor('');
            }
        } catch (e) { console.error(e); }
        setLoadingHistory(false);
    };

    useEffect(() => { loadHistory(selectedDate); }, [selectedDate, db]);

    const deleteDay = async () => {
        if (!user.isAdmin) return;
        if (!confirm(`Sei SICURO di voler cancellare TUTTI gli ordini del ${selectedDate}? Questa azione è irreversibile.`)) return;
        await deleteDoc(doc(db, PUBLIC_ORDERS_COLLECTION, selectedDate));
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6 relative h-[80vh] flex flex-col">
                <button onClick={onClose} className="absolute top-4 right-4 text-2xl text-gray-400 hover:text-gray-600">&times;</button>
                <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">📜 Archivio Storico</h2>
                <div className="flex gap-4 items-center mb-4 bg-gray-50 p-3 rounded border">
                    <label className="font-bold text-sm">Seleziona Data:</label>
                    <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="border p-1 rounded" />
                </div>
                <div className="flex-1 overflow-y-auto border rounded-lg p-4 bg-gray-50">
                    {loadingHistory ? <p>Caricamento...</p> : (
                        historyOrders.length === 0 ? <p className="text-gray-500 italic text-center">Nessun ordine ufficiale inviato in questa data.</p> : (
                            <div className="space-y-2">
                                {historyStatus === 'sent' && (
                                    <div className="bg-green-100 border border-green-300 text-green-800 p-2 rounded text-sm font-bold mb-3 text-center">
                                        ✅ Ordine inviato da: {historyAuthor || 'Sconosciuto'}
                                    </div>
                                )}
                                {historyOrders.map((o, i) => (
                                    <div key={i} className="bg-white p-2 rounded border flex justify-between text-sm items-center">
                                        <div className="flex gap-2 items-center">
                                            <span className="font-bold text-gray-700">{o.userName}</span>
                                            <span className="text-gray-600">{o.itemName}</span>
                                        </div>
                                        <span className={`text-xs px-2 py-1 rounded font-bold ${o.isTakeout ? "bg-red-100 text-red-600" : "bg-orange-100 text-orange-600"}`}>
                                            {o.isTakeout ? "🥡 Asporto" : "☕ Bar"}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )
                    )}
                </div>
                {user.isAdmin && historyOrders.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-red-100 flex justify-end">
                        <button onClick={deleteDay} className="text-red-600 hover:text-red-800 text-xs font-bold flex items-center gap-1 bg-red-50 px-3 py-2 rounded border border-red-200">
                            🗑️ Elimina Tutta la Giornata (Admin)
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

const AdminCalendar = ({ activeDates, onToggleDate, todayStr }) => {
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
    const firstDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();
    const changeMonth = (v) => { const d = new Date(currentMonth); d.setMonth(d.getMonth() + v); setCurrentMonth(d); };
    const startOffset = (firstDay + 6) % 7;
    const days = Array.from({ length: daysInMonth }, (_, i) => new Date(currentMonth.getFullYear(), currentMonth.getMonth(), i + 1));

    return (
        <div className="p-2">
            <div className="flex justify-between items-center mb-4 bg-gray-100 p-2 rounded-lg">
                <button onClick={() => changeMonth(-1)} className="px-4 py-1 font-bold text-lg bg-white rounded shadow text-gray-600 hover:bg-gray-50">❮</button>
                <h4 className="font-bold capitalize text-gray-700 text-lg">{currentMonth.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}</h4>
                <button onClick={() => changeMonth(1)} className="px-4 py-1 font-bold text-lg bg-white rounded shadow text-gray-600 hover:bg-gray-50">❯</button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center mb-1">
                {['L', 'M', 'M', 'G', 'V', 'S', 'D'].map(d => <span key={d} className="text-xs font-bold text-gray-500">{d}</span>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: startOffset }).map((_, i) => <div key={`${currentMonth.getFullYear()}-${currentMonth.getMonth()}-empty-${i}`}></div>)}
                {days.map(d => {
                    const dStr = formatDate(d);
                    const isActive = activeDates.includes(dStr);
                    const isToday = todayStr === dStr;
                    return (
                        <button key={dStr} onClick={() => onToggleDate(dStr)} className={`p-2 rounded text-sm font-bold transition-all border ${isToday ? 'ring-2 ring-blue-500 ring-offset-1 shadow-md z-10' : ''} ${isActive ? 'bg-green-600 text-white shadow-md hover:bg-green-700' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}>
                            {d.getDate()}
                        </button>
                    )
                })}
            </div>
            <p className="text-center text-xs text-gray-400 mt-3">Verde = Aperto. Grigio = Chiuso.</p>
        </div>
    );
};

const AdminPanel = ({ db, onClose, colleaguesList, adminOverride, onToggleForceOpen, adminName, todayStr }) => {
    const [tab, setTab] = useState('cal');
    const [settings, setSettings] = useState(INITIAL_SETTINGS);
    const [activeDates, setActiveDates] = useState([]);
    const [loadingDates, setLoadingDates] = useState(true);

    useEffect(() => {
        if (!db) return;
        getDoc(doc(db, HOLIDAYS_DOC_PATH)).then(snap => {
            if (snap.exists() && snap.data().activeDates) setActiveDates(snap.data().activeDates);
            else setDoc(doc(db, HOLIDAYS_DOC_PATH), { activeDates: generateAllowedDates() }, { merge: true }).catch(console.error);
        }).catch(console.error).finally(() => setLoadingDates(false));
        getDoc(doc(db, SETTINGS_DOC_PATH, 'main')).then(snap => { if (snap.exists()) setSettings(snap.data()); });
    }, [db]);

    const handleToggleDate = async (dStr) => {
        const newDates = activeDates.includes(dStr) ? activeDates.filter(d => d !== dStr) : [...activeDates, dStr];
        setActiveDates(newDates);
        await setDoc(doc(db, HOLIDAYS_DOC_PATH), { activeDates: newDates }, { merge: true });
    };

    const saveSettings = async () => {
        await setDoc(doc(db, SETTINGS_DOC_PATH, 'main'), settings, { merge: true });
        alert("Salvato!");
    };

    const sendCreds = (user) => {
        const subject = encodeURIComponent("Credenziali App Pranzo");
        const body = encodeURIComponent(`Ciao ${user.name},\n\necco il tuo PIN per accedere all'app dei pasti: ${user.pin}\n\nSe vuoi cambiarlo, contattami.\n\nSaluti,\n${adminName}`);
        const gmailLink = `https://mail.google.com/mail/?view=cm&fs=1&to=${user.email}&su=${subject}&body=${body}`;
        window.open(gmailLink, '_blank');
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full h-[85vh] flex flex-col relative overflow-hidden">
                <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                    <h2 className="font-bold text-lg text-gray-800">⚙️ Amministrazione di {adminName}</h2>
                    <button onClick={onClose} className="text-2xl text-gray-400 hover:text-gray-600">&times;</button>
                </div>
                <div className="flex border-b">
                    <button onClick={()=>setTab('cal')} className={`flex-1 py-3 font-bold text-xs ${tab==='cal'?'border-b-2 border-orange-500 text-orange-600':''}`}>CALENDARIO</button>
                    <button onClick={()=>setTab('users')} className={`flex-1 py-3 font-bold text-xs ${tab==='users'?'border-b-2 border-blue-500 text-blue-600':''}`}>UTENTI</button>
                    <button onClick={()=>setTab('set')} className={`flex-1 py-3 font-bold text-xs ${tab==='set'?'border-b-2 border-gray-500 text-gray-600':''}`}>SETTINGS</button>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                    {tab === 'cal' && (
                        <div className="space-y-4">
                            <div className={`p-4 rounded-xl border-2 flex justify-between items-center ${adminOverride ? 'bg-green-50 border-green-500' : 'bg-red-50 border-red-200'}`}>
                                <div><p className="font-bold text-sm text-gray-800">Stato Override</p><p className={`text-xs font-bold ${adminOverride ? 'text-green-600' : 'text-red-500'}`}>{adminOverride ? "🔓 APERTO FORZATO" : "🔴 Regole Standard"}</p></div>
                                <button onClick={()=>onToggleForceOpen(!adminOverride)} className="bg-white border px-4 py-2 rounded-lg text-xs font-bold shadow-sm hover:shadow-md transition-all">{adminOverride ? "BLOCCA" : "SBLOCCA ORA"}</button>
                            </div>
                            {loadingDates ? <LoadingSpinner text="Carico calendario..." /> : 
                                <AdminCalendar activeDates={activeDates} onToggleDate={toggleDate} todayStr={todayStr} />
                            }
                        </div>
                    )}
                    {tab === 'users' && (
                        <div className="space-y-2">
                            {COLLEAGUES_LIST.map(u => (
                                <div key={u.id} className="flex justify-between items-center p-3 border-b text-sm hover:bg-gray-50">
                                    <div><span className="font-bold text-gray-700">{u.name}</span> <span className="text-xs text-gray-400 ml-1">({u.pin})</span></div>
                                    <button onClick={()=>sendPin(u)} className="bg-blue-50 text-blue-600 border border-blue-200 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-100">✉️ Invia PIN</button>
                                </div>
                            ))}
                        </div>
                    )}
                    {tab === 'set' && (
                        <div className="space-y-4">
                            <div><label className="text-xs font-bold text-gray-500 uppercase">Email Bar</label><input className="w-full border p-3 rounded-lg mt-1" value={settings.emailBar} onChange={e=>setSettings({...settings, emailBar:e.target.value})} /></div>
                            <div><label className="text-xs font-bold text-gray-500 uppercase">Telefono Bar</label><input className="w-full border p-3 rounded-lg mt-1" value={settings.phoneBar} onChange={e=>setSettings({...settings, phoneBar:e.target.value})} /></div>
                            <button onClick={saveSettings} className="w-full bg-green-600 text-white font-bold py-3 rounded-lg shadow hover:bg-green-700">Salva Impostazioni</button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// --- APP ---
const App = () => {
    // Definizione di tutte le variabili di stato e costanti prima di qualsiasi logica
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    
    const todayDate = new Date();
    const todayStr = formatDate(todayDate);
    const [time, setTime] = useState(new Date());

    const [activeDates, setActiveDates] = useState(generateAllowedDates());
    const [settings, setSettings] = useState(INITIAL_SETTINGS);
    const [orders, setOrders] = useState([]);
    const [orderStatus, setOrderStatus] = useState('open');
    const [adminOverride, setAdminOverride] = useState(false);
    const [orderAuthor, setOrderAuthor] = useState('');

    const [actingAsUser, setActingAsUser] = useState(null);
    const [dish, setDish] = useState('');
    const [water, setWater] = useState('');
    const [type, setType] = useState('');
    const [message, setMessage] = useState('');
    
    const [showAdmin, setShowAdmin] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [showHelp, setShowHelp] = useState(false);
    const [showUserStats, setShowUserStats] = useState(false); 

    // LOGICA ORARIA E STATO (Calcolata dopo gli stati)
    useEffect(() => { const t = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(t); }, []);
    
    const hour = time.getHours();
    const minute = time.getMinutes();
    const currentTime = hour * 60 + minute;
    
    const time1030 = 10 * 60 + 30; // 10:30
    const time1200 = 12 * 60;      // 12:00
    const time1300 = 13 * 60;      // 13:00

    const isTodayAllowed = activeDates.includes(todayStr) || adminOverride;
    const isLateWarning = !adminOverride && isTodayAllowed && (currentTime >= time1030 && currentTime < time1200); // 10:30 - 11:59
    const isBookingClosed = !adminOverride && (currentTime >= time1200); // Blocco Modulo Ordini (12:00+)
    const isEmailClosed = !adminOverride && (currentTime >= time1300);  // Blocco Email Totale (13:00+)
    const isClosedView = !isTodayAllowed; // Giorno non lavorativo
    
    const forceStart = () => { setLoading(false); setDataLoaded(true); console.warn("Avvio forzato."); };

    // 1. INIT FIREBASE & LOAD DATA
    useEffect(() => {
        if (Object.keys(firebaseConfig).length === 0) { setLoading(false); return; }
        const timeoutId = setTimeout(() => { forceStart(); }, 7000);
        try {
            const app = initializeApp(firebaseConfig);
            const authInstance = getAuth(app);
            const dbInstance = getFirestore(app);
            setDb(dbInstance);
            setAuth(authInstance);
            
            const subscribeToData = () => {
                onSnapshot(doc(dbInstance, SETTINGS_DOC_PATH, 'main'), (snap) => { if (snap.exists()) setSettings(snap.data()); }, (err) => console.error(err));
                onSnapshot(doc(dbInstance, HOLIDAYS_DOC_PATH), (snap) => { if (snap.exists()) setActiveDates(snap.data().activeDates || generateAllowedDates()); else setDoc(doc(dbInstance, HOLIDAYS_DOC_PATH), { activeDates: generateAllowedDates() }, { merge: true }).catch(console.error); }, (err) => console.error(err));
                onSnapshot(doc(dbInstance, CONFIG_DOC_PATH, 'override'), (snap) => { if (snap.exists()) setAdminOverride(snap.data().isOverride || false); }, (err) => console.error(err));
            };
            
            const initAuth = async () => { if (!authInstance.currentUser) { if (initialAuthToken) await signInWithCustomToken(authInstance, initialAuthToken).catch(() => signInAnonymously(authInstance)); else await signInAnonymously(authInstance); } };
            
            initAuth().then(() => { subscribeToData(); setDataLoaded(true); });
            onAuthStateChanged(authInstance, (u) => { if (u) { setLoading(false); clearTimeout(timeoutId); setIsAuthReady(true); } });
            return () => clearTimeout(timeoutId);
        } catch (e) { console.error("Errore init:", e); setLoading(false); }
    }, []);

    // Restore user session (dopo il caricamento)
    useEffect(() => {
        if (user || !dataLoaded || !COLLEAGUES_LIST.length) return;
        const savedUserId = sessionStorage.getItem('mealUser');
        if (savedUserId) { 
            const found = COLLEAGUES_LIST.find(c => c.id === savedUserId); 
            if (found) { setUser(found); setActingAsUser(found); }
        }
    }, [dataLoaded, user]);

    // LISTENER ORDINI
    useEffect(() => {
        if (!db || !auth || !auth.currentUser) return;
        const docRef = doc(db, PUBLIC_ORDERS_COLLECTION, todayStr);
        const unsubscribe = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setOrders(data.orders || []);
                setOrderStatus(data.status || 'open');
                setOrderAuthor(data.confirmedBy || '');
                if (actingAsUser) {
                    const existingOrder = (data.orders || []).find(o => o.userId === actingAsUser.id);
                    if (existingOrder) { setDish(existingOrder.itemName || ''); setWater(existingOrder.waterChoice || ''); setType(existingOrder.isTakeout ? 'asporto' : 'bar'); }
                    else { setDish(''); setWater(''); setType(''); }
                }
            } else { setOrders([]); setOrderStatus('open'); setOrderAuthor(''); }
        }, (err) => { console.error("Errore listener ordini:", err); });
        return () => unsubscribe();
    }, [db, auth, actingAsUser, todayStr]);


    // --- HANDLERS DI BASE ---

    const handleLogin = (colleague) => { setUser(colleague); setActingAsUser(colleague); sessionStorage.setItem('mealUser', colleague.id); };
    
    // Funzione handleLogout (era mancante nella visibilità precedente)
    const handleLogout = () => { 
        setUser(null); setActingAsUser(null); 
        sessionStorage.removeItem('mealAppUser'); 
        setDish(''); setWater(''); setType(''); 
    };

    const handleAdminUserChange = (e) => { const targetId = e.target.value; const targetUser = COLLEAGUES_LIST.find(c => c.id === targetId); if (targetUser) { setActingAsUser(targetUser); setMessage(''); } };
    const adminEditOrder = (targetUserId) => { const targetUser = COLLEAGUES_LIST.find(c => c.id === targetUserId); if (targetUser) setActingAsUser(targetUser); };
    const adminDeleteOrder = async (targetUserId) => { if (!confirm("Sei sicuro di voler eliminare questo ordine?")) return; try { const orderRef = doc(db, PUBLIC_ORDERS_COLLECTION, todayStr); await updateDoc(orderRef, { orders: orders.filter(o => o.userId !== targetUserId) }); } catch (e) { console.error(e); } };

    const placeOrder = async () => {
        if (orderStatus === 'sent' && !user.isAdmin) { alert("Ordine già inviato al bar! Non puoi modificare."); return; }
        if (!isTodayAllowed && !user.isAdmin) { alert("Oggi il servizio è chiuso e non puoi ordinare."); return; }
        if (isBookingClosed && !user.isAdmin) { alert("Troppo tardi! Sono passate le 12:00. Solo l'admin può modificare."); return; }
        const newErrors = {}; let hasError = false;
        if (!dish || dish.trim() === '') { newErrors.dishName = true; hasError = true; }
        if (!water) { newErrors.water = true; hasError = true; }
        if (!type) { newErrors.dining = true; hasError = true; }
        setErrors(newErrors);
        if (hasError) { setTimeout(() => alert("⚠️ Compila tutti i campi evidenziati in rosso!"), 100); return; }
        const orderRef = doc(db, PUBLIC_ORDERS_COLLECTION, todayStr);
        const cleanDishName = dish.charAt(0).toUpperCase() + dish.slice(1);
        const newOrder = { userId: actingAsUser.id, userName: actingAsUser.name, itemName: cleanDishName, waterChoice: water, isTakeout: type === 'asporto', timestamp: Date.now(), };
        try { await setDoc(orderRef, { mealDate: todayStr }, { merge: true }); const updatedOrders = orders.filter(o => o.userId !== actingAsUser.id).concat([newOrder]); await updateDoc(orderRef, { orders: updatedOrders }); if (user.id === actingAsUser.id) { setMessage("Ordine salvato! Ricordati di inviare se sei l'ultimo."); } else { setMessage(`Ordine salvato per ${actingAsUser.name}!`); } setErrors({}); } catch (e) { console.error(e); setMessage("Errore invio ordine"); }
    };

    const cancelOrder = async () => { if (orderStatus === 'sent' && !user.isAdmin) { alert("Ordine già inviato al bar! Non puoi cancellare."); return; } try { const orderRef = doc(db, PUBLIC_ORDERS_COLLECTION, todayStr); await updateDoc(orderRef, { orders: orders.filter(o => o.userId !== actingAsUser.id) }); setDish(''); setWater(''); setType(''); setMessage("Ordine annullato 🗑️"); } catch (e) { console.error(e); } };
    const markSent = async () => { if (!confirm("Confermi INVIO?")) return; await setDoc(doc(db, PUBLIC_ORDERS_COLLECTION, todayStr), { status: 'sent', confirmedBy: user.name }, { merge: true }); };
    const unlockDay = async () => { if (!confirm("Riaprire?")) return; await setDoc(doc(db, CONFIG_DOC_PATH, 'override'), { isOverride: false }, { merge: true }); await setDoc(doc(db, PUBLIC_ORDERS_COLLECTION, todayStr), { status: 'open', confirmedBy: '' }, { merge: true }); };

    // --- UTILITY MAIL ---
    const getAllEmails = () => COLLEAGUES_LIST.map(c => c.email).filter(email => email && email.includes('@')).join(',');

    const generateMail = () => {
        const groupedDishes = orders.reduce((acc, o) => { const key = o.itemName.trim(); acc[key] = (acc[key] || 0) + 1; return acc; }, {});
        const water = orders.reduce((acc, o) => { const w = o.waterChoice || 'Nessuna'; acc[w] = (acc[w] || 0) + 1; return acc; }, {});
        let text = `Ciao Laura,\n`;
        text += `ecco il riepilogo dell'ordine di oggi ${todayDate.toLocaleDateString('it-IT')}.\n`;
        text += `Ti segnalo gentilmente che gli ordini DA ASPORTO 🥡 e da consumare AL BAR ☕ sono tutti per le ore 13:30.\n`;
        text += `Grazie come sempre per la disponibilità!\nA dopo\n\n`;
        text += `=========================================\n`;
        text += `RIEPILOGO ORDINE DEL ${todayDate.toLocaleDateString('it-IT')}\n`;
        text += `TOTALE ORDINI: ${orders.length}\n`;
        text += `=========================================\n`;
        text += "\n--- 🍽️ PIATTI ---\n";
        Object.entries(groupedDishes).forEach(([name, count]) => { text += `${count}x 🥗 ${name}\n`; });
        text += "\n--- 💧 ACQUA ---\n";
        if (water['Naturale']) text += `${water['Naturale']}x 💧 Naturale\n`;
        if (water['Frizzante']) text += `${water['Frizzante']}x 🫧 Frizzante\n`;
        const sortedOrders = [...orders].sort((a, b) => a.userName.localeCompare(b.userName));
        const barOrders = sortedOrders.filter(o => !o.isTakeout);
        const takeoutOrders = sortedOrders.filter(o => o.isTakeout);
        text += "\n--- ☕ AL BAR ---\n";
        if (barOrders.length === 0) text += "Nessun ordine al bar.\n";
        barOrders.forEach((o, i) => { text += `${i + 1}. ${o.userName}: 🥗 ${o.itemName}${o.waterChoice && o.waterChoice !== 'Nessuna' ? ` [${o.waterChoice}]` : ''}\n`; });
        text += "\n--- 🥡 DA ASPORTO ---\n";
        if (takeoutOrders.length === 0) text += "Nessun ordine da asporto.\n";
        takeoutOrders.forEach((o, i) => { text += `${i + 1}. ${o.userName}: 🥗 ${o.itemName}${o.waterChoice && o.waterChoice !== 'Nessuna' ? ` [${o.waterChoice}]` : ''}\n`; });
        return text;
    };

    const openGmail = () => {
        const subject = encodeURIComponent(`Ordine Pranzo Ufficio - ${todayStr}`);
        const body = encodeURIComponent(generateMail());
        window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${settings.emailBar}&cc=${getAllEmails()}&su=${subject}&body=${body}`, '_blank');
    };
    
    const openDefaultMail = () => {
        const subject = encodeURIComponent(`Ordine Pranzo Ufficio - ${todayStr}`);
        window.location.href = `mailto:${settings.emailBar}?cc=${getAllEmails()}&subject=${subject}&body=${generateMail()}`;
    };

    const openLateEmail = () => {
        const subject = encodeURIComponent(`Ordine Personale Tardivo - ${todayStr}`);
        const body = encodeURIComponent(`Ciao, sono ${user.name}.\nVorrei ordinare per oggi:\n\n- [SCRIVI QUI IL PIATTO]\n\nGrazie!`);
        window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${settings.emailBar}&su=${subject}&body=${body}`, '_blank');
    };


    if(loading) return <LoadingSpinner />;
    if(!user) return <LoginScreen onLogin={handleLogin} colleagues={COLLEAGUES_LIST} />;

    const sortedOrders = [...orders].sort((a,b) => a.userName.localeCompare(b.userName));

    return (
        <div className="min-h-screen bg-gray-100 pb-20 font-sans text-gray-800">
            
            {/* HEADER */}
            <div className="relative h-48 bg-gray-900 overflow-hidden shadow-lg">
                 <div className="absolute inset-0 bg-cover bg-center opacity-60" style={{ backgroundImage: `url(${BANNER_IMAGE_URL})` }}></div>
                 <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-transparent to-transparent"></div>
                 <div className="relative z-10 p-6 flex justify-between items-end h-full">
                     <div>
                         <div className="bg-white text-green-800 text-xs font-bold px-2 py-1 rounded mb-2 inline-block shadow">TEL. {settings.phoneBar}</div>
                         <h1 className="text-4xl font-extrabold text-white font-serif tracking-wide drop-shadow-md">7 MILA CAFFÈ</h1>
                     </div>
                     <div className="text-right hidden sm:block">
                         <p className="text-gray-200 italic font-serif text-lg border-l-2 border-green-500 pl-3">"Il pranzo è sacro."</p>
                     </div>
                 </div>
            </div>

            {/* STATUS BAR */}
            <div className="bg-gray-800 text-white px-4 py-3 shadow-md flex justify-between items-center text-sm border-b border-gray-700 sticky top-0 z-40">
                 <div className="font-medium text-gray-300">Data: <span className="text-white font-bold">{todayDate.toLocaleDateString('it-IT')}</span></div>
                 <div className="flex items-center gap-3">
                      <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full ${orderStatus!=='sent'?'bg-gray-600 text-white':'text-gray-500'}`}><span className="bg-white text-black rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold">1</span> Raccolta</div>
                      <div className="w-4 h-0.5 bg-gray-600"></div>
                      <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full ${orderStatus==='sent'?'bg-green-600 text-white':'text-gray-500'}`}><span className="bg-white text-black rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold">2</span> Inviato</div>
                 </div>
                 <div className="flex items-center gap-2 font-mono font-bold">
                     {isLateWarning && <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>}
                     {isEmailClosed && <span className="w-2 h-2 bg-red-600 rounded-full"></span>}
                     {time.toLocaleTimeString('it-IT', {hour:'2-digit', minute:'2-digit'})}
                 </div>
            </div>

            {/* NAVBAR */}
            <div className="bg-white shadow-sm p-2 flex justify-between items-center px-4">
                <div className="font-bold text-green-800">Ciao, <span className="text-black">{user.name.split(' ')[0]}</span></div>
                <div className="flex gap-2">
                     {user.isAdmin && <button onClick={()=>setShowAdmin(true)} className="bg-orange-500 text-white px-3 py-1 rounded text-xs font-bold shadow hover:bg-orange-600">⚙️ Admin</button>}
                     <button onClick={()=>setShowHistory(true)} className="bg-purple-600 text-white px-3 py-1 rounded text-xs font-bold shadow hover:bg-purple-700">📜 Storico</button>
                     <button onClick={()=>setShowHelp(true)} className="bg-blue-600 text-white px-3 py-1 rounded text-xs font-bold shadow hover:bg-blue-700">ℹ️ Guida</button>
                     <button onClick={handleLogout} className="border border-gray-300 text-gray-600 px-3 py-1 rounded text-xs font-bold hover:bg-gray-50">Esci</button>
                </div>
            </div>

            {showAdmin && <AdminPanel db={db} onClose={()=>setShowAdmin(false)} colleaguesList={COLLEAGUES_LIST} adminOverride={adminOverride} onToggleForceOpen={(v)=>setDoc(doc(db, CONFIG_DOC_PATH, 'override'), {isOverride:v})} todayStr={todayStr} adminName={user.name} />}
            {showHistory && <AdminHistory db={db} onClose={()=>setShowHistory(false)} user={user} />}
            {showHelp && <HelpModal onClose={()=>setShowHelp(false)} />}
            {showUserStats && <UserStatsModal db={db} user={user} onClose={()=>setShowUserStats(false)} />}

            <div className="max-w-6xl mx-auto p-4 grid grid-cols-1 lg:grid-cols-12 gap-6">
                
                {/* SINISTRA: MODULO */}
                <div className="lg:col-span-7 space-y-4">
                    {isClosedView ? (
                        <ClosedScreen nextDate={getNextOpenDay(todayStr, activeDates)} />
                    ) : (
                        <div className="bg-white p-6 rounded-2xl shadow-lg border-l-4 border-green-600">
                             {/* INTESTAZIONE MODULO */}
                             <div className="mb-6 pb-4 border-b flex justify-between items-center">
                                 <h3 className="text-xl font-bold text-gray-800">Ordina il tuo pranzo</h3>
                                 {user.isAdmin && user.id !== actingAsUser.id && (
                                     <div className="bg-yellow-100 text-yellow-800 text-xs px-3 py-1 rounded-full font-bold">
                                         Stai ordinando per: {actingAsUser.name}
                                         <button onClick={()=>setActingAsUser(user)} className="ml-2 underline">X</button>
                                     </div>
                                 )}
                             </div>
                             
                             {isBookingClosed ? (
                                 <div className="bg-red-50 border border-red-200 p-6 rounded-xl text-center">
                                     <div className="text-3xl mb-2">🛑</div>
                                     <h3 className="text-red-800 font-bold text-lg">ORDINI CHIUSI (12:00)</h3>
                                     <p className="text-red-600 text-sm">Il tempo per ordinare è scaduto.</p>
                                 </div>
                             ) : (
                                 <>
                                     <div className="mb-6">
                                         <label className="block text-gray-500 text-xs font-bold uppercase mb-2">1. COSA MANGI?</label>
                                         <input className="w-full border-2 border-gray-200 p-4 rounded-xl text-lg font-bold text-gray-700 focus:border-green-500 focus:ring-2 focus:ring-green-100 outline-none transition-all" placeholder="Es. Pasta al pomodoro..." value={dish} onChange={e=>setDish(e.target.value)} />
                                     </div>

                                     <div className="grid grid-cols-2 gap-4 mb-6">
                                         <div>
                                             <label className="block text-gray-500 text-xs font-bold uppercase mb-2">2. ACQUA</label>
                                             <div className="flex flex-col gap-2 h-full">
                                                 {['Naturale','Frizzante','Nessuna'].map(w => (
                                                     <div key={w} className="flex-1"><WaterIcon type={w} selected={water===w} onClick={()=>setWater(w)} /></div>
                                                 ))}
                                             </div>
                                         </div>
                                         <div>
                                             <label className="block text-gray-500 text-xs font-bold uppercase mb-2">3. DOVE</label>
                                             <div className="flex flex-col gap-2 h-full">
                                                {['bar','asporto'].map(t => (
                                                    <div key={t} className="flex-1"><TypeBtn type={t} active={type===t} onClick={()=>setType(t)} /></div>
                                                ))}
                                             </div>
                                         </div>
                                     </div>

                                     <div className="pt-4 border-t">
                                         {orders.find(o=>o.userId===actingAsUser.id) ? (
                                             <div className="flex items-center justify-between bg-green-50 p-4 rounded-xl border border-green-200">
                                                 <div>
                                                     <span className="text-green-800 font-bold block">✅ Ordine Salvato</span>
                                                     <span className="text-green-600 text-xs">{dish}</span>
                                                 </div>
                                                 <button onClick={deleteMyOrder} className="bg-white text-red-500 border border-red-200 px-4 py-2 rounded-lg text-sm font-bold hover:bg-red-50">Cancella</button>
                                             </div>
                                         ) : (
                                             <button onClick={saveOrder} className="w-full bg-gradient-to-r from-green-600 to-green-500 text-white py-4 rounded-xl font-bold text-lg shadow-lg hover:shadow-xl transform transition active:scale-95">
                                                 SALVA SCELTA
                                             </button>
                                         )}
                                         {message && <p className="text-center text-green-600 font-bold mt-3 text-sm animate-fade-in-up">{message}</p>}
                                     </div>
                                 </>
                             )}
                        </div>
                    )}
                </div>

                {/* DESTRA: INVIO */}
                <div className="lg:col-span-5 space-y-6">
                    
                    <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 relative overflow-hidden">
                         <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
                         <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><span className="text-xl">🚀</span> ZONA INVIO</h3>
                         
                         {isEmailClosed && !isClosedView ? (
                             <div className="space-y-3 text-center">
                                 <div className="bg-red-50 text-red-800 p-3 rounded-lg border border-red-200 font-bold text-sm">🛑 EMAIL CHIUSA (13:00)</div>
                                 <p className="text-xs text-gray-500">È troppo tardi per l'email. Chiama direttamente.</p>
                                 <a href={`tel:${settings.phoneBar}`} className="block w-full bg-green-600 text-white font-bold py-3 rounded-xl shadow hover:bg-green-700 transition-colors">📞 CHIAMA BAR</a>
                                 {user.isAdmin && <button onClick={markSent} className="text-xs text-gray-400 underline mt-2">Admin: Forza stato Inviato</button>}
                             </div>
                         ) : (isClosedView && !adminOverride) ? (
                             <div className="space-y-3 text-center">
                                 <p className="text-sm text-gray-500 italic">Oggi il servizio è chiuso.</p>
                                 <button onClick={openLateEmail} className="block w-full bg-blue-600 text-white font-bold py-3 rounded-xl shadow hover:bg-blue-700 transition-colors">✉️ MAIL PERSONALE</button>
                                 <p className="text-[10px] text-gray-400">Invia una mail a tuo nome (senza CC).</p>
                             </div>
                         ) : (
                             <div className="space-y-3">
                                 {isLateWarning && (
                                    <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-3 rounded text-sm font-bold animate-pulse flex items-center gap-2">
                                        <span>⏰</span> È TARDI! (10:30+) - INVIA ORA
                                    </div>
                                 )}
                                 
                                 {orderStatus === 'sent' ? (
                                     <div className="bg-green-50 border border-green-200 p-4 rounded-xl text-center">
                                         <div className="text-3xl mb-2">✅</div>
                                         <p className="text-green-800 font-bold">ORDINE INVIATO</p>
                                         <p className="text-green-600 text-xs">Confermato da {orderAuthor}</p>
                                         {user.isAdmin && <button onClick={unlockDay} className="mt-3 text-xs text-gray-400 underline">🔓 Sblocca (Admin)</button>}
                                     </div>
                                 ) : (
                                     <>
                                        <p className="text-xs text-gray-500 mb-2">Se sei l'ultimo, invia l'email e poi conferma.</p>
                                        <div className="grid grid-cols-2 gap-2">
                                            <button onClick={openGmail} className="bg-white border-2 border-red-100 text-red-600 py-2 rounded-lg font-bold text-xs hover:bg-red-50 transition-colors flex flex-col items-center justify-center gap-1">
                                                <span className="text-lg">🔴</span> Gmail Web
                                            </button>
                                            <button onClick={openDefaultMail} className="bg-white border-2 border-gray-100 text-gray-600 py-2 rounded-lg font-bold text-xs hover:bg-gray-50 transition-colors flex flex-col items-center justify-center gap-1">
                                                <span className="text-lg">📱</span> App Email
                                            </button>
                                        </div>
                                        <button onClick={markSent} className="w-full bg-green-600 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-green-700 transition-transform active:scale-95 flex items-center justify-center gap-2 mt-2">
                                            <span>✅</span> CONFERMA INVIO
                                        </button>
                                     </>
                                 )}
                             </div>
                         )}
                    </div>

                    <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-1 h-full bg-purple-500"></div>
                        <div className="flex justify-between items-center mb-4 border-b pb-2">
                            <h3 className="font-bold text-gray-800 flex items-center gap-2"><span className="text-xl">👀</span> RIEPILOGO</h3>
                            <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded-full text-xs font-bold">{orders.length} Ordini</span>
                        </div>
                        
                        <div className="overflow-y-auto max-h-[400px] pr-1 custom-scrollbar">
                            {sortedOrders.length === 0 ? (
                                <p className="text-center text-gray-400 italic py-8">Nessun ordine inserito oggi.</p>
                            ) : (
                                <div className="space-y-3">
                                    {sortedOrders.map((o, i) => (
                                        <div key={o.userId} className="bg-gray-50 p-3 rounded-lg border border-gray-100 flex justify-between items-start group hover:border-purple-200 transition-colors">
                                            <div>
                                                <span className="font-bold text-gray-800 block text-sm">{o.userName}</span>
                                                <span className="text-gray-600 text-xs block mt-0.5">{o.itemName}</span>
                                                {o.waterChoice && o.waterChoice !== 'Nessuna' && <span className="text-[10px] text-blue-500 mt-1 inline-block bg-blue-50 px-1.5 rounded">{o.waterChoice}</span>}
                                            </div>
                                            <div className="flex flex-col items-end gap-1">
                                                <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${o.isTakeout?'bg-red-100 text-red-600':'bg-orange-100 text-orange-600'}`}>{o.isTakeout?'ASPORTO':'BAR'}</span>
                                                {user.isAdmin && <button onClick={()=>adminDeleteOrder(o.userId)} className="text-red-400 hover:text-red-600 text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity px-1">🗑️</button>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};

export default App;
