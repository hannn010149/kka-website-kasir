import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  LayoutDashboard, ShoppingCart, Package, ReceiptText, Settings, Search,
  ChevronDown, Plus, Minus, Trash2, Printer, X, Menu, TrendingUp, Users,
  DollarSign, Pill, CheckCircle2, AlertCircle, Edit3, Eye, Upload, LogOut
} from 'lucide-react';
import { supabase } from './supabase';
import './App.css';

const rupiah = n => new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n||0);
const settingsDefaults = {
  store_name:'BAPI FARMA', store_owner:'', store_address:'', store_phone:'',
  store_email:'', cashier_name:'Kasir', store_logo:'', discount_enabled:false,
  discount_percentage:0, minimum_discount_amount:0, receipt_footer:'Terima kasih',
  receipt_note:'', primary_color:'#168b72',
  dark_mode:false, show_logo:true, show_address:true, show_phone:true, show_cashier:true,
  show_date:true, show_time:true
};

function unwrap({data,error}) {
  if(error) throw new Error(error.message);
  return data;
}

function adaptTransaction(transaction) {
  return {
    ...transaction,
    transaction_number:transaction.invoice_no||`TRX-${transaction.id}`,
    cashier:transaction.cashier||'Kasir',
    paid:transaction.amount_paid,
    change:transaction.change_amount,
    payment_status:'Pembayaran Berhasil'
  };
}

function adaptTransactionItem(item) {
  return {...item,quantity:item.qty};
}

async function fetchTransactionDetail(id) {
  const [transactionResult,itemsResult]=await Promise.all([
    supabase.from('transactions').select('*').eq('id',id).single(),
    supabase.from('transaction_items').select('*').eq('transaction_id',id).order('id')
  ]);
  return {
    ...adaptTransaction(unwrap(transactionResult)),
    items:unwrap(itemsResult).map(adaptTransactionItem)
  };
}

function createDashboard(transactions,products,items) {
  const salesByDate=new Map();
  const popularByProduct=new Map();
  for(const transaction of transactions){
    const date=transaction.created_at.slice(0,10);
    const sales=salesByDate.get(date)||{date,total:0,count:0};
    sales.total+=transaction.total;sales.count+=1;salesByDate.set(date,sales);
  }
  for(const item of items){
    const popular=popularByProduct.get(item.product_name)||{name:item.product_name,qty:0,total:0};
    popular.qty+=item.qty;popular.total+=item.subtotal;popularByProduct.set(item.product_name,popular);
  }
  return {
    totalTransactions:transactions.length,
    totalRevenue:transactions.reduce((sum,transaction)=>sum+transaction.total,0),
    productCount:products.length,
    customerCount:transactions.length,
    recent:transactions.slice(0,5),
    sales:[...salesByDate.values()].sort((a,b)=>a.date.localeCompare(b.date)).slice(-7),
    popular:[...popularByProduct.values()].sort((a,b)=>b.qty-a.qty).slice(0,5)
  };
}

async function fetchAppData() {
  const [settingsResult,productsResult,transactionsResult,itemsResult]=await Promise.all([
    supabase.from('settings').select('*').eq('id',1).single(),
    supabase.from('products').select('*').order('id',{ascending:false}),
    supabase.from('transactions').select('*').order('created_at',{ascending:false}),
    supabase.from('transaction_items').select('product_name,qty,subtotal')
  ]);
  return {
    settings:unwrap(settingsResult),
    products:unwrap(productsResult),
    transactions:unwrap(transactionsResult).map(adaptTransaction),
    items:unwrap(itemsResult)
  };
}

function App(){
  const [page,setPage]=useState('dashboard');
  const [session,setSession]=useState(null);
  const [authLoading,setAuthLoading]=useState(true);
  const [settings,setSettings]=useState(null);
  const [products,setProducts]=useState([]);
  const [transactions,setTransactions]=useState([]);
  const [dashboard,setDashboard]=useState(null);
  const [loadError,setLoadError]=useState('');
  const [cart,setCart]=useState([]);
  const [notice,setNotice]=useState('');
  const [mobile,setMobile]=useState(false);
  const [receipt,setReceipt]=useState(null);
  const [qris,setQris]=useState(null);
  const [payment,setPayment]=useState({method:'Tunai',paid:''});

  useEffect(()=>{
    let active=true;
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,nextSession)=>{
      setSession(nextSession);setAuthLoading(false);
    });
    supabase.auth.getSession().then(({data,error})=>{
      if(!active)return;
      if(error)setLoadError(error.message);
      setSession(data.session);setAuthLoading(false);
    });
    return ()=>{active=false;subscription.unsubscribe();};
  },[]);
  const applyAppData=({settings:s,products:p,transactions:t,items:i})=>{
    setSettings(s);setProducts(p);setTransactions(t);setDashboard(createDashboard(t,p,i));setLoadError('');
  };
  const load=async()=>applyAppData(await fetchAppData());
  useEffect(()=>{
    if(!session)return;
    let active=true;
    fetchAppData().then(data=>{if(active)applyAppData(data);}).catch(e=>{if(active)setLoadError(e.message);});
    return ()=>{active=false;};
  },[session]);
  useEffect(()=>{
    if(settings){document.documentElement.style.setProperty('--primary',settings.primary_color||'#168b72'); document.body.classList.toggle('dark',!!settings.dark_mode);}
  },[settings]);

  const notify=(msg)=>{setNotice(msg);setTimeout(()=>setNotice(''),3500)};
  const refresh=async()=>{await load();};
  const signOut=async()=>{
    const {error}=await supabase.auth.signOut();
    if(error)notify(error.message);
    else {setSettings(null);setProducts([]);setTransactions([]);setDashboard(null);}
  };
  const addToCart=p=>{
    if(p.stock<1){notify('Stok habis');return}
    setCart(c=>{
      const found=c.find(x=>x.product_id===p.id);
      if(found){
        if(found.quantity>=p.stock){notify(`Jumlah tidak boleh melebihi stok (${p.stock}).`);return c;}
        return c.map(x=>x.product_id===p.id?{...x,quantity:x.quantity+1}:x);
      }
      return [...c,{product_id:p.id,name:p.name,price:p.price,stock:p.stock,quantity:1}];
    });
  };
  const changeQty=(id,delta)=>{
    setCart(c=>c.map(x=>x.product_id===id?{...x,quantity:Math.min(x.stock,x.quantity+delta)}:x).filter(x=>x.quantity>0));
  };
  const subtotal=cart.reduce((n,x)=>n+x.price*x.quantity,0);
  const discount=settings?.discount_enabled&&subtotal>=settings.minimum_discount_amount?Math.round(subtotal*settings.discount_percentage/100):0;
  const total=subtotal-discount;

  const processPayment=async()=>{
    if(!cart.length){notify('Keranjang masih kosong.');return;}
    if(payment.method==='Tunai'&&Number(payment.paid)<total){notify('Uang pembayaran tidak mencukupi.');return;}
    if(payment.method==='QRIS'){
      setQris({total,items:cart});
      return;
    }
    await submitTransaction(payment.paid);
  };
  const submitTransaction=async(paid)=>{
    try{
      const created=unwrap(await supabase.rpc('create_transaction',{
        p_items:cart.map(({product_id,quantity})=>({product_id,qty:quantity})),
        p_payment_method:qris?'QRIS':payment.method,
        p_amount_paid:Number(paid)
      }));
      setCart([]);setPayment({method:'Tunai',paid:''});setQris(null);
      setReceipt(await fetchTransactionDetail(created.id));
      await refresh();
    }catch(e){notify(e.message)}
  };

  if(authLoading) return <div className="loading-page"><Pill size={44}/>Memeriksa sesi admin...</div>;
  if(!session) return <LoginPage onLogin={async(email,password)=>{
    const {error}=await supabase.auth.signInWithPassword({email,password});
    if(error)throw new Error(error.message);
  }}/>;
  if(!settings) return <div className="loading-page"><Pill size={44}/>{loadError?<div>{loadError}<button className="btn-primary" onClick={()=>load().catch(e=>setLoadError(e.message))}>Coba lagi</button></div>:'Memuat BAPI FARMA...'}</div>;

  return (
    <div className="app-shell">
      <Sidebar settings={settings} page={page} setPage={setPage} mobile={mobile} setMobile={setMobile}/>
      {mobile&&<div className="overlay" onClick={()=>setMobile(false)}/>}
      <main className="main">
        <Header settings={settings} setMobile={setMobile} setPage={setPage} signOut={signOut}/>
        {notice&&<div className="notification"><AlertCircle size={18}/>{notice}<button onClick={()=>setNotice('')}><X size={16}/></button></div>}
        {page==='dashboard'&&<Dashboard data={dashboard} settings={settings} setPage={setPage}/>}
        {page==='products'&&<Products products={products} refresh={refresh} notify={notify}/>}
        {page==='cashier'&&<Cashier products={products} cart={cart} addToCart={addToCart} changeQty={changeQty}
          setCart={setCart} subtotal={subtotal} discount={discount} total={total} payment={payment} setPayment={setPayment}
          processPayment={processPayment}/>}
        {page==='transactions'&&<Transactions transactions={transactions} refresh={refresh} setReceipt={setReceipt} notify={notify}/>}
        {page==='settings'&&<SettingsPage settings={settings} session={session} refresh={refresh} notify={notify}/>}
      </main>
      {qris&&<div className="modal-backdrop"><div className="modal qris-modal">
        <div className="modal-icon"><Pill/></div><h3>{settings.store_name}</h3><p>Pembayaran QRIS</p>
        <QRCodeSVG value={`DUMMY-QRIS|${settings.store_name}|${qris.total}`} size={190}/>
        <strong className="qris-total">{rupiah(qris.total)}</strong>
        <small>{settings.store_name}<br/>{settings.store_address}</small>
        <button className="btn-primary full" onClick={()=>{setPayment(p=>({...p,method:'QRIS'}));setTimeout(()=>submitTransaction(qris.total),700)}}>Simulasi Pembayaran</button>
        <button className="btn-ghost full" onClick={()=>{setQris(null);notify('Pembayaran dibatalkan')}}>Batalkan</button>
      </div></div>}
      {receipt&&<Receipt receipt={receipt} settings={settings} close={()=>setReceipt(null)}/>}
    </div>
  );
}

function LoginPage({onLogin}){
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const submit=async e=>{
    e.preventDefault();setError('');setBusy(true);
    try{await onLogin(email,password);}
    catch(e){setError(e.message);}
    finally{setBusy(false);}
  };
  return <main className="loading-page" style={{background:'#f5f8f7',padding:'20px'}}>
    <form className="modal" onSubmit={submit} style={{width:'min(420px,100%)'}}>
    <div className="modal-icon"><Pill/></div><h1>Login Admin</h1><p>Masuk untuk mengelola BAPI FARMA.</p>
    <label style={{display:'grid',gap:6,marginTop:14}}>Email<input style={{height:42,border:'1px solid #dde6e2',borderRadius:8,padding:'0 10px'}} type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/></label>
    <label style={{display:'grid',gap:6,marginTop:14}}>Password<input style={{height:42,border:'1px solid #dde6e2',borderRadius:8,padding:'0 10px'}} type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label>
    {error&&<div style={{marginTop:12,color:'#c85966',fontSize:13}} role="alert">{error}</div>}
    <button className="btn-primary full" type="submit" disabled={busy}>{busy?'Memproses...':'Masuk'}</button>
    </form>
  </main>;
}

function Sidebar({settings,page,setPage,mobile,setMobile}){
  const items=[
    ['dashboard','Dashboard',LayoutDashboard],['cashier','Kasir',ShoppingCart],['products','Produk',Package],
    ['transactions','Riwayat Transaksi',ReceiptText],['settings','Pengaturan',Settings]
  ];
  return <aside className={`sidebar ${mobile?'open':''}`}>
    <div className="brand">{settings.store_logo?<img src={settings.store_logo}/>:<div className="brand-mark"><Pill/></div>}
      <div><b>{settings.store_name}</b><small>APOTEK</small></div></div>
    <nav>{items.map(([id,label,Icon])=><button key={id} className={page===id?'active':''} onClick={()=>{setPage(id);setMobile(false)}}><Icon size={20}/><span>{label}</span></button>)}</nav>
    <div className="sidebar-footer"><span>© 2026 BAPI FARMA</span></div>
  </aside>
}

function Header({settings,setMobile,setPage,signOut}){
  return <header className="header"><button className="menu-btn" onClick={()=>setMobile(true)}><Menu/></button>
    <div className="search"><Search size={18}/><input placeholder="Cari produk, transaksi..."/></div>
    <div className="header-actions"><span className="online"><i/>Online</span><button className="profile" onClick={()=>setPage('settings')}><div className="avatar">{settings.cashier_name?.[0]||'A'}</div><div><b>{settings.cashier_name}</b><small>Kasir</small></div><ChevronDown size={16}/></button><button onClick={signOut} title="Keluar" aria-label="Keluar" style={{border:0,background:'transparent',color:'var(--primary)',display:'grid',placeItems:'center'}}><LogOut size={18}/></button></div>
  </header>
}

function Dashboard({data,settings,setPage}){
  if(!data) return null;
  const cards=[
    ['Total Transaksi',data.totalTransactions,ReceiptText,'#eaf8f4'],
    ['Total Pendapatan',rupiah(data.totalRevenue),DollarSign,'#fff3df'],
    ['Jumlah Produk',data.productCount,Package,'#edeaff'],
    ['Total Pelanggan',data.customerCount,Users,'#ffeaf0']
  ];
  return <div className="page">
    <div className="page-heading"><div><p>Ringkasan Hari Ini</p><h1>Dashboard</h1></div><span>Selamat datang, {settings.cashier_name}</span></div>
    <div className="banner"><div><span>Hidup Sehat Dimulai dari Sini!</span><small>Selalu hadir untuk kesehatan Anda dan keluarga.</small></div><Pill size={66}/></div>
    <div className="stats">{cards.map(([label,value,Icon,bg])=><div className="stat-card" key={label}><div className="stat-icon" style={{background:bg}}><Icon/></div><div><small>{label}</small><strong>{value}</strong></div></div>)}</div>
    <div className="dashboard-grid">
      <section className="panel sales-panel"><div className="panel-title"><div><h3>Grafik Penjualan</h3><small>7 hari terakhir</small></div><TrendingUp size={20}/></div>
        <MiniChart data={data.sales}/></section>
      <section className="panel"><div className="panel-title"><div><h3>Produk Terpopuler</h3><small>Berdasarkan penjualan</small></div></div>
        <div className="popular">{data.popular.length?data.popular.map((p,i)=><div key={p.name}><div className="popular-rank">{i+1}</div><div><b>{p.name}</b><small>{p.qty} terjual</small></div><strong>{rupiah(p.total)}</strong></div>):<p className="empty">Belum ada penjualan</p>}</div>
      </section>
    </div>
    <section className="panel"><div className="panel-title"><div><h3>Transaksi Terbaru</h3></div><button className="text-btn" onClick={()=>setPage('transactions')}>Lihat semua</button></div>
      <div className="table-wrap"><table><thead><tr><th>Nomor</th><th>Tanggal</th><th>Total</th><th>Kasir</th><th>Status</th></tr></thead><tbody>
      {data.recent.map(t=><tr key={t.id}><td>{t.transaction_number}</td><td>{t.created_at}</td><td>{rupiah(t.total)}</td><td>{t.cashier}</td><td><span className="status success">Berhasil</span></td></tr>)}</tbody></table></div>
    </section>
  </div>
}

function MiniChart({data}){
  if(!data?.length) return <div className="empty-chart">Belum ada data penjualan</div>;
  const max=Math.max(...data.map(d=>d.total),1);
  return <div className="chart">{data.map(d=><div key={d.date} className="bar-wrap"><span>{rupiah(d.total).replace('Rp','')}</span><div className="bar" style={{height:`${Math.max(12,d.total/max*180)}px`}}/><small>{d.date.slice(5)}</small></div>)}</div>
}

function Products({products,refresh,notify}){
  const [search,setSearch]=useState('');const [category,setCategory]=useState('Semua');const [stock,setStock]=useState('Semua');
  const [sort,setSort]=useState('default');const [form,setForm]=useState(null);const [detail,setDetail]=useState(null);
  const categories=['Semua',...new Set(products.map(p=>p.category))];
  let shown=products.filter(p=>p.name.toLowerCase().includes(search.toLowerCase())&&(category==='Semua'||p.category===category)&&(stock==='Semua'||(stock==='Habis'?p.stock===0:stock==='Tersedia'?p.stock>0:stock==='Sedikit'?p.stock>0&&p.stock<5:p.stock>=5)));
  if(sort==='asc')shown=[...shown].sort((a,b)=>a.price-b.price);if(sort==='desc')shown=[...shown].sort((a,b)=>b.price-a.price);
  const remove=async p=>{if(!window.confirm(`Hapus produk "${p.name}"?`))return;try{unwrap(await supabase.from('products').delete().eq('id',p.id));await refresh();notify('Produk berhasil dihapus.')}catch(e){notify(e.message)}};
  return <div className="page"><div className="page-heading"><div><p>Kelola inventori</p><h1>Produk</h1></div><button className="btn-primary" onClick={()=>setForm({name:'',price:'',stock:'',category:'Umum'})}><Plus size={18}/>Tambah Produk</button></div>
    <section className="panel"><div className="toolbar"><div className="search table-search"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cari produk..."/></div>
      <select value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(c=><option key={c}>{c}</option>)}</select>
      <select value={stock} onChange={e=>setStock(e.target.value)}><option value="Semua">Semua stok</option><option value="Tersedia">Stok tersedia</option><option value="Sedikit">Stok sedikit</option><option value="Habis">Stok habis</option></select>
      <select value={sort} onChange={e=>setSort(e.target.value)}><option value="default">Urutkan harga</option><option value="asc">Harga terendah</option><option value="desc">Harga tertinggi</option></select></div>
      <div className="table-wrap"><table><thead><tr><th>ID</th><th>Nama Produk</th><th>Kategori</th><th>Harga</th><th>Stok</th><th>Status</th><th>Aksi</th></tr></thead><tbody>
      {shown.map(p=><tr key={p.id}><td>#{p.id}</td><td><b>{p.name}</b></td><td>{p.category}</td><td>{rupiah(p.price)}</td><td>{p.stock}</td><td><span className={`status ${p.stock?'success':'danger'}`}>{p.stock?'Tersedia':'Habis'}</span></td><td><div className="row-actions"><button onClick={()=>setDetail(p)} title="Detail"><Eye/></button><button onClick={()=>setForm(p)} title="Edit"><Edit3/></button><button className="delete" onClick={()=>remove(p)} title="Hapus"><Trash2/></button></div></td></tr>)}</tbody></table></div>
    </section>
    {form&&<ProductForm form={form} setForm={setForm} refresh={refresh} notify={notify}/>}
    {detail&&<div className="modal-backdrop"><div className="modal detail-modal"><button className="modal-close" onClick={()=>setDetail(null)}><X/></button><h3>Detail Produk</h3><dl><dt>Nama</dt><dd>{detail.name}</dd><dt>Kategori</dt><dd>{detail.category}</dd><dt>Harga</dt><dd>{rupiah(detail.price)}</dd><dt>Stok</dt><dd>{detail.stock}</dd></dl></div></div>}
  </div>
}

function ProductForm({form,setForm,refresh,notify}){
  const isEdit=!!form.id;
  const [value,setValue]=useState({...form});
  const set=k=>e=>setValue(v=>({...v,[k]:e.target.value}));
  const save=async e=>{
    e.preventDefault();
    try{
      const product={
        name:value.name.trim(),price:Number(value.price),stock:Number(value.stock),
        category:value.category||'Umum'
      };
      const query=isEdit
        ?supabase.from('products').update(product).eq('id',form.id)
        :supabase.from('products').insert(product);
      unwrap(await query);await refresh();setForm(null);notify(isEdit?'Produk berhasil diperbarui.':'Produk berhasil ditambahkan.');
    }catch(e){notify(e.message)}
  };
  return <div className="modal-backdrop"><form className="modal product-form" onSubmit={save}><div className="modal-head"><h3>{isEdit?'Edit Produk':'Tambah Produk'}</h3><button type="button" onClick={()=>setForm(null)}><X/></button></div>
    <div className="form-grid"><label>Nama produk<input required value={value.name} onChange={set('name')}/></label><label>Kategori<input value={value.category} onChange={set('category')}/></label>
    <label>Harga (Rp)<input required type="number" min="1" value={value.price} onChange={set('price')}/></label><label>Stok<input required type="number" min="0" value={value.stock} onChange={set('stock')}/></label></div>
    <div className="form-actions"><button type="button" className="btn-ghost" onClick={()=>setForm(null)}>Batal</button><button className="btn-primary" type="submit">Simpan</button></div>
  </form></div>
}

function Cashier({products,cart,addToCart,changeQty,setCart,subtotal,discount,total,payment,setPayment,processPayment}){
  const [search,setSearch]=useState('');
  const shown=products.filter(p=>p.name.toLowerCase().includes(search.toLowerCase()));
  return <div className="page cashier-page"><div className="page-heading"><div><p>Pilih produk untuk dijual</p><h1>Kasir</h1></div></div>
    <div className="cashier-layout"><section><div className="search cashier-search"><Search/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cari produk..."/></div><div className="product-grid">
      {shown.map(p=><div className={`product-card ${p.stock===0?'sold-out':''}`} key={p.id}><b className="product-card-name">{p.name}</b><strong className="product-card-price">{rupiah(p.price)}</strong><div className="product-card-bottom"><span>Stok {p.stock}</span></div><button disabled={p.stock===0} onClick={()=>addToCart(p)}>{p.stock===0?'Stok habis':<><Plus/>Tambah</>}</button></div>)}
    </div></section>
    <aside className="cart"><div className="cart-head"><h3>Keranjang</h3><button onClick={()=>setCart([])}>Kosongkan</button></div>
      <div className="cart-items">{cart.length?cart.map(x=><div className="cart-item" key={x.product_id}><div className="cart-info"><b>{x.name}</b><small>{rupiah(x.price)}</small></div><div className="qty"><button onClick={()=>changeQty(x.product_id,-1)}><Minus/></button><span>{x.quantity}</span><button onClick={()=>changeQty(x.product_id,1)}><Plus/></button></div><button className="remove" onClick={()=>setCart(c=>c.filter(y=>y.product_id!==x.product_id))}><Trash2/></button></div>):<div className="empty-cart"><ShoppingCart/><p>Keranjang masih kosong</p></div>}</div>
      <div className="payment-box"><label>Metode Pembayaran</label><div className="payment-methods"><button className={payment.method==='Tunai'?'active':''} onClick={()=>setPayment(p=>({...p,method:'Tunai'}))}>Tunai</button><button className={payment.method==='QRIS'?'active':''} onClick={()=>setPayment(p=>({...p,method:'QRIS'}))}>QRIS</button></div>
      {payment.method==='Tunai'&&<label>Uang pembayaran<input type="number" min="0" value={payment.paid} onChange={e=>setPayment(p=>({...p,paid:e.target.value}))} placeholder="Masukkan jumlah"/></label>}
      <div className="totals"><div><span>Subtotal</span><b>{rupiah(subtotal)}</b></div><div><span>Diskon</span><b>-{rupiah(discount)}</b></div><div className="grand"><span>Total Bayar</span><strong>{rupiah(total)}</strong></div>
      {payment.method==='Tunai'&&<div><span>Kembalian</span><b>{rupiah(Math.max(0,Number(payment.paid||0)-total))}</b></div>}</div>
      <button className="btn-primary checkout" onClick={processPayment}>Proses Pembayaran</button></div>
    </aside></div>
  </div>
}

function Transactions({transactions,refresh,setReceipt,notify}){
  const [search,setSearch]=useState('');
  const [date,setDate]=useState('');
  const shown=transactions.filter(t=>(t.transaction_number.toLowerCase().includes(search.toLowerCase())||t.cashier.toLowerCase().includes(search.toLowerCase()))&&(!date||t.created_at.startsWith(date)));
  const detail=async t=>{
    try{
      setReceipt(await fetchTransactionDetail(t.id));
    }catch(e){notify(e.message);}
  };
  return <div className="page"><div className="page-heading"><div><p>Daftar semua pembayaran</p><h1>Riwayat Transaksi</h1></div><button className="btn-ghost" onClick={refresh}>Muat ulang</button></div>
    <section className="panel"><div className="toolbar"><div className="search table-search"><Search/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cari nomor atau kasir..."/></div><input type="date" value={date} onChange={e=>setDate(e.target.value)} /></div>
      <div className="table-wrap"><table><thead><tr><th>Nomor Transaksi</th><th>Tanggal</th><th>Total</th><th>Uang Dibayar</th><th>Kembalian</th><th>Metode</th><th>Kasir</th><th>Status</th><th>Aksi</th></tr></thead><tbody>
      {shown.map(t=><tr key={t.id}><td><b>{t.transaction_number}</b></td><td>{t.created_at}</td><td>{rupiah(t.total)}</td><td>{rupiah(t.paid)}</td><td>{rupiah(t.change)}</td><td>{t.payment_method}</td><td>{t.cashier}</td><td><span className="status success">{t.payment_status}</span></td><td><div className="row-actions"><button onClick={()=>detail(t)}><Eye/></button><button onClick={()=>detail(t)}><Printer/></button></div></td></tr>)}</tbody></table></div>
    </section>
  </div>
}

function Receipt({receipt,settings,close}){
  if(!receipt)return null;
  const print=()=>{
    const el=document.querySelector('.receipt-paper');const w=window.open('','','width=380,height=700');
    w.document.write(`<html><head><title>Struk ${receipt.transaction_number}</title><style>body{font-family:monospace;width:80mm;margin:0 auto;font-size:12px}.receipt{text-align:center}.receipt table{width:100%;border-collapse:collapse}.right{text-align:right}.item{text-align:left}hr{border:none;border-top:1px dashed #333}@media print{@page{size:80mm auto;margin:2mm}}</style></head><body>${el.innerHTML}</body></html>`);w.document.close();w.print();
  };
  return <div className="modal-backdrop"><div className="modal receipt-modal"><button className="modal-close" onClick={close}><X/></button><div className="receipt-paper receipt">
    {settings.show_logo&&<div className="receipt-logo">{settings.store_logo?<img src={settings.store_logo}/>:<Pill/>}</div>}
    <h2>{settings.store_name}</h2>{settings.show_address&&<p>{settings.store_address}</p>}{settings.show_phone&&<p>No. Telp: {settings.store_phone}</p>}
    <hr/><p>No. {receipt.transaction_number}</p>{settings.show_date&&<p>Tanggal: {receipt.created_at?.slice(0,10)}</p>}{settings.show_time&&<p>Waktu: {receipt.created_at?.slice(11,16)}</p>}{settings.show_cashier&&<p>Kasir: {receipt.cashier}</p>}<p>Metode: {receipt.payment_method}</p><p>Pembayaran: {receipt.payment_status}</p><hr/>
    <table><thead><tr><th className="item">Nama</th><th>Qty</th><th className="right">Subtotal</th></tr></thead><tbody>{receipt.items?.map(i=><tr key={i.id||i.product_id}><td className="item">{i.product_name||i.name}<br/>{rupiah(i.price)}</td><td>{i.quantity}</td><td className="right">{rupiah(i.subtotal||i.price*i.quantity)}</td></tr>)}</tbody></table><hr/>
    <table><tbody><tr><td>Subtotal</td><td className="right">{rupiah(receipt.subtotal)}</td></tr><tr><td>Diskon</td><td className="right">{rupiah(receipt.discount)}</td></tr><tr><td><b>Total Bayar</b></td><td className="right"><b>{rupiah(receipt.total)}</b></td></tr><tr><td>Uang Dibayar</td><td className="right">{rupiah(receipt.paid)}</td></tr><tr><td>Kembalian</td><td className="right">{rupiah(receipt.change)}</td></tr></tbody></table><hr/>
    <p>{settings.receipt_footer}</p><p><b>{settings.receipt_note}</b></p>
  </div><button className="btn-primary full" onClick={print}><Printer size={18}/>Cetak Struk</button></div></div>
}

function SettingsPage({settings,session,refresh,notify}){
  const [draft,setDraft]=useState({...settings});
  const [admin,setAdmin]=useState({
    name:session.user.user_metadata?.name||'',
    email:session.user.email||'',
    photo:session.user.user_metadata?.photo||'',
    password:''
  });
  const set=k=>e=>setDraft(v=>({...v,[k]:e.target.type==='checkbox'?e.target.checked:e.target.value}));
  const save=async e=>{
    e.preventDefault();
    try{
      if(!draft.store_name?.trim()||!draft.store_address?.trim()||!draft.store_phone?.trim())throw new Error('Nama, alamat, dan nomor telepon toko wajib diisi.');
      unwrap(await supabase.from('settings').update(draft).eq('id',1));
      await refresh();notify('Pengaturan berhasil disimpan.');
    }catch(e){notify(e.message)}
  };
  const reset=async()=>{
    if(!window.confirm('Reset seluruh pengaturan ke awal?'))return;
    try{
      const resetSettings=unwrap(await supabase.from('settings').update(settingsDefaults).eq('id',1).select().single());
      await refresh();setDraft(resetSettings);notify('Pengaturan berhasil direset.');
    }catch(e){notify(e.message)}
  };
  const saveAdmin=async e=>{
    e?.preventDefault();
    try{
      const updates={email:admin.email.trim(),data:{...session.user.user_metadata,name:admin.name.trim(),photo:admin.photo||''}};
      if(admin.password)updates.password=admin.password;
      const updated=unwrap(await supabase.auth.updateUser(updates));
      setAdmin({name:updated.user.user_metadata?.name||'',email:updated.user.email||'',photo:updated.user.user_metadata?.photo||'',password:''});
      notify('Profil admin berhasil disimpan.');
    }catch(e){notify(e.message)}
  };
  const upload=async e=>{
    const file=e.target.files[0];if(!file)return;
    if(!/^image\/(jpeg|png|webp|gif)$/.test(file.type)){notify('Format logo harus JPEG, PNG, WebP, atau GIF.');return}
    if(file.size>5*1024*1024){notify('Ukuran logo maksimal 5 MB.');return}
    try{
      const path=`logos/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
      const {data,error}=await supabase.storage.from('store-logos').upload(path,file,{contentType:file.type});
      if(error)throw new Error(error.message);
      const {data:{publicUrl}}=supabase.storage.from('store-logos').getPublicUrl(data.path);
      setDraft(v=>({...v,store_logo:publicUrl}));
    }catch(error){notify(error.message)}
  };
  return <div className="page"><div className="page-heading"><div><p>Konfigurasi aplikasi</p><h1>Pengaturan</h1></div></div>
    <form onSubmit={save} className="settings-layout"><div className="settings-main">
      <section className="panel settings-section"><h3>Identitas Toko</h3><div className="form-grid">
        <label>Nama toko<input value={draft.store_name||''} onChange={set('store_name')}/></label><label>Nama pemilik<input value={draft.store_owner||''} onChange={set('store_owner')}/></label>
        <label>Alamat toko<input value={draft.store_address||''} onChange={set('store_address')}/></label><label>Nomor telepon<input value={draft.store_phone||''} onChange={set('store_phone')}/></label>
        <label>Email<input type="email" value={draft.store_email||''} onChange={set('store_email')}/></label><label>Nama kasir<input value={draft.cashier_name||''} onChange={set('cashier_name')}/></label></div></section>
      <section className="panel settings-section"><h3>Logo</h3><div className="logo-settings"><div className="logo-preview">{draft.store_logo?<img src={draft.store_logo}/>:<Pill/>}</div><div><label className="btn-ghost upload-button"><Upload size={18}/>Unggah Logo<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={upload}/></label>{draft.store_logo&&<button type="button" className="text-danger" onClick={()=>setDraft(v=>({...v,store_logo:''}))}>Hapus logo</button>}</div></div></section>
      <section className="panel settings-section"><h3>Diskon</h3><div className="form-grid"><label className="toggle-label">Diskon aktif<input type="checkbox" checked={!!draft.discount_enabled} onChange={set('discount_enabled')}/></label><label>Persentase (%)<input type="number" value={draft.discount_percentage||0} onChange={set('discount_percentage')}/></label><label>Minimal pembelian (Rp)<input type="number" value={draft.minimum_discount_amount||0} onChange={set('minimum_discount_amount')}/></label></div></section>
      <section className="panel settings-section"><h3>Isi Struk</h3><div className="form-grid"><label>Catatan 1<input value={draft.receipt_footer||''} onChange={set('receipt_footer')}/></label><label>Catatan 2<input value={draft.receipt_note||''} onChange={set('receipt_note')}/></label></div><div className="toggle-grid">{[['show_logo','Tampilkan logo'],['show_address','Tampilkan alamat'],['show_phone','Tampilkan nomor telepon'],['show_cashier','Tampilkan kasir'],['show_date','Tampilkan tanggal'],['show_time','Tampilkan waktu']].map(([k,label])=><label key={k}><input type="checkbox" checked={!!draft[k]} onChange={set(k)}/>{label}</label>)}</div></section>
      <section className="panel settings-section"><h3>Tampilan</h3><div className="form-grid"><label>Warna utama<input type="color" value={draft.primary_color||'#168b72'} onChange={set('primary_color')}/></label><label className="toggle-label">Mode gelap<input type="checkbox" checked={!!draft.dark_mode} onChange={set('dark_mode')}/></label></div></section>
      <section className="panel settings-section"><h3>Profil Admin</h3><div><div className="form-grid"><label>Nama admin<input required value={admin.name||''} onChange={e=>setAdmin(v=>({...v,name:e.target.value}))}/></label><label>Email login<input type="email" required value={admin.email||''} onChange={e=>setAdmin(v=>({...v,email:e.target.value}))}/></label><label>Password baru<input type="password" minLength="6" value={admin.password||''} onChange={e=>setAdmin(v=>({...v,password:e.target.value}))} placeholder="Kosongkan bila tidak diubah"/></label><label>Foto profil (URL)<input value={admin.photo||''} onChange={e=>setAdmin(v=>({...v,photo:e.target.value}))}/></label></div><button className="btn-primary" type="button" onClick={saveAdmin} style={{marginTop:'12px'}}>Simpan Profil</button></div></section>
    </div><aside className="settings-preview"><h3>Preview</h3><div className={`preview-card ${draft.dark_mode?'dark-preview':''}`}><div className="preview-store"><Pill/><b>{draft.store_name||'Nama Toko'}</b></div><p>{draft.store_address}</p><hr/><p>Paracetamol &nbsp; 2 x Rp10.000</p><p><b>Total Rp20.000</b></p><small>{draft.receipt_footer}</small></div><div className="preview-actions"><button type="submit" className="btn-primary"><CheckCircle2/>Simpan Perubahan</button><button type="button" className="btn-ghost" onClick={reset}>Reset Pengaturan</button></div></aside></form>
  </div>
}

export default App;
