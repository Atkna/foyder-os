// Tarayıcı testleri için bellek içi sahte Supabase: yalnızca panelin kullandığı çağrılar.
// window.__seed başlangıç verisi (yenilemelerde sessionStorage'daki son hâl kullanılır), window.__role kullanıcı rolü,
// window.__fail=true okuma+yazma hatası, window.__failRead=true yalnızca okuma hatası taklidi,
// window.__beforeWrite(row) yazmadan hemen önce "başka bir kullanıcının" kaydını taklit eder.
(function(){
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  // Sayfa yenilenince de aynı "bulut" verisi kalsın (gerçek veritabanı gibi).
  let kept=null; try{ kept=JSON.parse(sessionStorage.getItem('__mockdb')||'null'); }catch(e){}
  window.__db={ row:kept||(window.__seed?clone(window.__seed):null), upserts:0, stamp:'2026-01-01T00:00:00.000Z', conflicts:0 };
  const keep=()=>{ try{ sessionStorage.setItem('__mockdb',JSON.stringify(window.__db.row)); }catch(e){} };
  const fail=()=>window.__fail?{data:null,error:{message:'ağ hatası (test)'}}:null;
  function q(table){
    const ctx={cols:'*'};
    const api={
      select(c){ ctx.cols=c; return api; }, eq(){ return api; },
      order(){ return Promise.resolve({data:[],error:null}); },
      async maybeSingle(){
        if(table==='profiles') return {data:{onayli:true,rol:window.__role||'admin'},error:null};
        const f=fail(); if(f) return f;
        if(window.__failRead) return {data:null,error:{message:'okuma hatası (test)'}};
        const row=window.__db.row; if(!row) return {data:null,error:null};
        if(ctx.cols==='data') return {data:{data:clone(row)},error:null};
        if(ctx.cols==='data,updated_at') return {data:{data:clone(row),updated_at:window.__db.stamp},error:null};
        if(ctx.cols==='hafiza:data->hafiza') return {data:{hafiza:clone(row.hafiza??null)},error:null};
        return {data:null,error:{message:'desteklenmeyen sütun'}};
      },
      async upsert(rec){ await new Promise(r=>setTimeout(r,25)); const f=fail(); if(f) return {error:f.error}; window.__db.row=clone(rec.data); window.__db.stamp=rec.updated_at; window.__db.upserts++; keep(); return {error:null}; },
      async insert(rec){ await new Promise(r=>setTimeout(r,25)); const f=fail(); if(f) return {error:f.error}; if(window.__db.row) return {error:{message:'duplicate key',code:'23505'}}; window.__db.row=clone(rec.data); window.__db.stamp=rec.updated_at; window.__db.upserts++; keep(); return {error:null}; },
      update(rec){
        const filt={};
        const u={ eq(k,v){ filt[k]=v; return u; }, async select(){
          await new Promise(r=>setTimeout(r,25)); const f=fail(); if(f) return {data:null,error:f.error};
          if(window.__beforeWrite){ const fn=window.__beforeWrite; window.__beforeWrite=null; fn(window.__db.row); window.__db.stamp=new Date(Date.now()-1000).toISOString(); }
          if('updated_at' in filt&&filt.updated_at!==window.__db.stamp){ window.__db.conflicts++; return {data:[],error:null}; }
          window.__db.row=clone(rec.data); window.__db.stamp=rec.updated_at; window.__db.upserts++; keep(); return {data:[{id:'main'}],error:null};
        } };
        return u;
      }
    };
    return api;
  }
  window.supabase={ createClient(){ return {
    from:q,
    auth:{ async getSession(){ return {data:{session:{user:{id:window.__uid||'u-test',email:'deneme@ornek.org',user_metadata:{name:window.__uname||'Deneme Kullanıcı'}}}}}; }, async signOut(){} },
    channel(){ const c={on(){return c;},subscribe(){return c;}}; return c; }
  }; } };
})();
