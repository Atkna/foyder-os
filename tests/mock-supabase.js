// Tarayıcı testleri için bellek içi sahte Supabase: yalnızca panelin kullandığı çağrılar.
// window.__seed başlangıç verisi (yenilemelerde sessionStorage'daki son hâl kullanılır), window.__role kullanıcı rolü, window.__fail=true kayıt hatası taklidi.
(function(){
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  // Sayfa yenilenince de aynı "bulut" verisi kalsın (gerçek veritabanı gibi).
  let kept=null; try{ kept=JSON.parse(sessionStorage.getItem('__mockdb')||'null'); }catch(e){}
  window.__db={ row:kept||(window.__seed?clone(window.__seed):null), upserts:0 };
  const fail=()=>window.__fail?{data:null,error:{message:'ağ hatası (test)'}}:null;
  function q(table){
    const ctx={cols:'*'};
    const api={
      select(c){ ctx.cols=c; return api; }, eq(){ return api; },
      order(){ return Promise.resolve({data:[],error:null}); },
      async maybeSingle(){
        if(table==='profiles') return {data:{onayli:true,rol:window.__role||'admin'},error:null};
        const f=fail(); if(f) return f;
        const row=window.__db.row; if(!row) return {data:null,error:null};
        if(ctx.cols==='data') return {data:{data:clone(row)},error:null};
        if(ctx.cols==='hafiza:data->hafiza') return {data:{hafiza:clone(row.hafiza??null)},error:null};
        return {data:null,error:{message:'desteklenmeyen sütun'}};
      },
      async upsert(rec){ await new Promise(r=>setTimeout(r,25)); const f=fail(); if(f) return {error:f.error}; window.__db.row=clone(rec.data); window.__db.upserts++; try{ sessionStorage.setItem('__mockdb',JSON.stringify(rec.data)); }catch(e){} return {error:null}; },
      update(){ return api; }
    };
    return api;
  }
  window.supabase={ createClient(){ return {
    from:q,
    auth:{ async getSession(){ return {data:{session:{user:{id:'u-test',email:'deneme@ornek.org',user_metadata:{name:'Deneme Kullanıcı'}}}}}; }, async signOut(){} },
    channel(){ const c={on(){return c;},subscribe(){return c;}}; return c; }
  }; } };
})();
