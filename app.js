(() => {
  const API = (window.ALMC_CONFIG && window.ALMC_CONFIG.API_URL || '').trim();
  const PLACEHOLDER = 'COLE_AQUI_A_URL_DO_APPS_SCRIPT_EXEC';
  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];
  const state = { token: localStorage.getItem('almox_token') || '', user:null, config:{}, itens:[], retiradas:[], movimentos:[], usuarios:[], efetivo:[], solicitacoes:[], dashboard:{}, currentView:'dashboard', configTab:'usuarios', history:{rows:[],page:1,hasPrevious:false,hasMore:false,loaded:false} };

  function normalizedRole(v){ return String(v || '').trim().toUpperCase(); }
  function isAdmin(){ return normalizedRole(state.user?.Perfil) === 'ADMIN'; }
  function itemNameKey(v){ return String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,' '); }
  function duplicateItemByName(name,ignoreId=''){ const key=itemNameKey(name); return key?(state.itens||[]).find(i=>String(i.ID||'')!==String(ignoreId||'')&&itemNameKey(i.Nome)===key):null; }
  function duplicatePendingRequestByName(name,ignoreId=''){ const key=itemNameKey(name); return key?(state.solicitacoes||[]).find(r=>String(r.ID||'')!==String(ignoreId||'')&&String(r.Status||'PENDENTE').toUpperCase()==='PENDENTE'&&itemNameKey(r.Nome)===key):null; }

  document.addEventListener('DOMContentLoaded', init);

  function init(){
    bindStatic();
    if (!API || API.includes(PLACEHOLDER)) $('#loginHelp').textContent = 'Antes de entrar, edite config.js e cole a URL /exec do Apps Script.';
    if (state.token && API && !API.includes(PLACEHOLDER)) refresh().catch(() => showLogin());
    else showLogin();
  }

  function bindStatic(){
    $('#loginForm').addEventListener('submit', login);
    $('#logoutBtn').addEventListener('click', logout);
    $('#changePinBtn').addEventListener('click', modalChangePin);
    $('#modalClose').addEventListener('click', closeModal);
    $('#menuBtn').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
    $$('#nav [data-view]').forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));
    $$('[data-goto]').forEach(b => b.addEventListener('click', () => switchView(b.dataset.goto)));
    $('#globalSearch').addEventListener('input', e => { switchView('itens'); $('#itemSearch').value=e.target.value; renderItems(); });
    $('#newItemBtn').addEventListener('click', () => modalRequest());
    $('#quickItemBtn').addEventListener('click', () => modalRequest());
    $('#newLoanBtn').addEventListener('click', () => modalLoan());
    $('#quickLoanBtn').addEventListener('click', () => modalLoan());
    $('#returnItemBtn').addEventListener('click', modalReturnSelect);
    $('#quickReturnBtn').addEventListener('click', modalReturnSelect);
    $('#newUserBtn').addEventListener('click', () => modalUser());
    $('#adminNewItemBtn').addEventListener('click', () => modalItem());
    $$('.config-tab').forEach(b => b.addEventListener('click', () => switchConfigTab(b.dataset.configTab)));
    $('#saveEfetivoBtn').addEventListener('click', saveEfetivo);
    $('#efetivoTextarea').addEventListener('input', updateEfetivoCount);
    $('#exportItemsBtn').addEventListener('click', exportItems);
    $('#exportLoansBtn').addEventListener('click', exportLoans);
    ['itemSearch','itemCategory','itemType','itemStatus','itemLocation'].forEach(id => $('#'+id).addEventListener(id==='itemSearch'||id==='itemLocation'?'input':'change', renderItems));
    ['loanSearch','loanStatus','loanFrom','loanTo'].forEach(id => $('#'+id).addEventListener(id==='loanSearch'?'input':'change', renderLoans));
    $('#historySearchBtn').addEventListener('click', () => loadHistory(1));
    $('#historyClearBtn').addEventListener('click', clearHistoryFilters);
    $('#historyPrevBtn').addEventListener('click', () => loadHistory(Math.max(1,state.history.page-1)));
    $('#historyNextBtn').addEventListener('click', () => { if(state.history.hasMore) loadHistory(state.history.page+1); });
    ['moveFrom','moveTo','moveItem','moveMilitary','moveProcess','moveUser','moveType'].forEach(id => $('#'+id).addEventListener('keydown', e => { if(e.key==='Enter'){ e.preventDefault(); loadHistory(1); } }));
  }

  async function api(action, data={}){
    if (!API || API.includes(PLACEHOLDER)) throw new Error('Configure a URL da API em config.js.');
    const body = new URLSearchParams();
    body.set('payload', JSON.stringify({ action, token: state.token, ...data }));
    let res;
    try { res = await fetch(API, { method:'POST', body, redirect:'follow', credentials:'omit' }); }
    catch(e){ throw new Error('Não foi possível acessar a API. Confira a URL /exec e a implantação do Apps Script.'); }
    let out;
    try { out = await res.json(); } catch(e){ throw new Error('A API retornou uma resposta inválida. Confira se a implantação está ativa.'); }
    if (!out.ok) throw new Error(out.error || 'Operação não concluída.');
    return out;
  }

  async function login(e){
    e.preventDefault(); setLoading(true);
    try{
      const out = await api('login',{login:$('#loginUser').value,pin:$('#loginPin').value});
      state.token=out.token; state.user=out.user; localStorage.setItem('almox_token',state.token); $('#loginPin').value='';
      await refresh();
    }catch(err){ toast(err.message,true); }
    finally{ setLoading(false); }
  }

  async function logout(){
    try{ if(state.token) await api('logout'); }catch(e){}
    state.token=''; state.user=null; localStorage.removeItem('almox_token'); showLogin();
  }

  async function refresh(){
    setLoading(true);
    try{
      const out = await api('bootstrap');
      Object.assign(state,{user:out.user,config:out.config||{},itens:out.itens||[],retiradas:out.retiradas||[],movimentos:out.movimentos||[],usuarios:out.usuarios||[],efetivo:out.efetivo||[],solicitacoes:out.solicitacoes||[],dashboard:out.dashboard||{}});
      if (state.user) state.user.Perfil = normalizedRole(state.user.Perfil);
      state.history.loaded=false;
      showApp(); renderAll();
      if(state.currentView==='historico') await loadHistory(1);
    }catch(err){
      if (/sessao|sessão|login|usuario inativo|usuário inativo/i.test(err.message)){ state.token=''; localStorage.removeItem('almox_token'); showLogin(); }
      throw err;
    }finally{ setLoading(false); }
  }

  function showLogin(){ $('#appView').classList.add('hidden'); $('#loginView').classList.remove('hidden'); }
  function showApp(){
    $('#loginView').classList.add('hidden'); $('#appView').classList.remove('hidden');
    $('#brandName').textContent=state.config.nomeSistema||'Controle de Almoxarifado';
    $('#userName').textContent=state.user.Nome; $('#userRole').textContent=state.user.Perfil; $('#userInitial').textContent=(state.user.Nome||'U').trim().charAt(0).toUpperCase();
    const admin=isAdmin();
    $$('.admin-only').forEach(x=>x.classList.toggle('hidden',!admin));
    $$('.can-write').forEach(x=>x.classList.remove('hidden'));
    if(!admin && state.currentView==='configuracoes') switchView('dashboard');
  }

  function renderAll(){ renderDashboard(); renderCategories(); renderItems(); renderLoans(); renderMoves(); renderUsers(); renderEfetivo(); renderAdminItems(); renderRequests(); }
  function switchView(name){
    if(name==='configuracoes' && !isAdmin()){
      toast('Configurações de Adm é exclusiva do perfil ADMIN.', true);
      return;
    }
    const target=$('#view-'+name);
    if(!target){ toast('Tela não encontrada.', true); return; }
    state.currentView=name;
    $$('.view').forEach(v=>v.classList.remove('active-view'));
    target.classList.remove('hidden');
    target.classList.add('active-view');
    $$('#nav [data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===name));
    $('#sidebar').classList.remove('open');
    if(name==='configuracoes') { renderUsers(); renderEfetivo(); renderAdminItems(); renderRequests(); switchConfigTab(state.configTab || 'usuarios'); }
    if(name==='historico' && !state.history.loaded) loadHistory(1);
  }

  function switchConfigTab(tab){
    if(!isAdmin()) return;
    const permitidas=['usuarios','efetivo','itens','solicitacoes'];
    state.configTab = permitidas.includes(tab) ? tab : 'usuarios';
    $$('.config-tab').forEach(b=>b.classList.toggle('active', b.dataset.configTab===state.configTab));
    $$('.config-panel').forEach(p=>p.classList.remove('active-config-panel'));
    const panel=$('#config-'+state.configTab);
    if(panel) panel.classList.add('active-config-panel');
    if(state.configTab==='usuarios') renderUsers();
    else if(state.configTab==='efetivo') renderEfetivo();
    else if(state.configTab==='itens') renderAdminItems();
    else renderRequests();
  }

  function renderDashboard(){
    const d=state.dashboard||{};
    const cards=[['📦',d.totalItens||0,'Itens cadastrados',''],['↗',d.retiradasAbertas||0,'Cautelas em aberto',''],['⚠',d.estoqueBaixo||0,'Estoque baixo','alert'],['⏰',d.atrasadas||0,'Cautelas atrasadas',d.atrasadas?'danger':'']];
    $('#kpiGrid').innerHTML=cards.map(c=>`<div class="kpi ${c[3]}"><div class="kpi-icon">${c[0]}</div><strong>${fmtNum(c[1])}</strong><span>${esc(c[2])}</span></div>`).join('');
    const alerts=state.itens.filter(i=>i.Ativo!==false&&statusItem(i)!=='NORMAL').sort((a,b)=>num(a.QuantidadeAtual)-num(b.QuantidadeAtual)).slice(0,8);
    $('#stockAlerts').innerHTML=alerts.length?alerts.map(i=>`<div class="list-row"><div class="item-icon">${esc(i.Icone||'📦')}</div><div class="grow"><strong class="truncate">${esc(i.Nome)}</strong><div class="meta">${esc(i.Codigo)} • ${esc(i.Localizacao||'Sem localização')} • ${esc(itemTypeLabel(i.TipoItem))}</div></div>${badgeItem(i)}</div>`).join(''):'<div class="empty">Nenhum alerta de estoque.</div>';
    const ab=state.retiradas.filter(r=>['ABERTA','PARCIAL'].includes(r.Status)).sort((a,b)=>dateMs(a.PrevistaDevolucao||'9999')-dateMs(b.PrevistaDevolucao||'9999')).slice(0,8);
    $('#loanAlerts').innerHTML=ab.length?ab.map(r=>`<div class="list-row"><div class="item-icon">↗</div><div class="grow"><strong class="truncate">${esc(r.ItemNome)}</strong><div class="meta">${esc(r.RetiradoPor)}${r.ProcessoSEI?' • SEI '+esc(r.ProcessoSEI):''} • ${r.PrevistaDevolucao?fmtDate(r.PrevistaDevolucao):'Sem prazo'}</div></div>${badgeLoan(r)}</div>`).join(''):'<div class="empty">Nenhuma cautela pendente.</div>';
    $('#recentActivity').innerHTML=state.movimentos.slice(0,10).map(m=>`<div class="list-row"><div class="item-icon">${moveIcon(m.Tipo)}</div><div class="grow"><strong>${esc(labelMove(m.Tipo))} · ${esc(m.ItemNome)}</strong><div class="meta">${fmtDate(m.DataHora)} • ${esc(m.UsuarioSistema||m.Militar||'')}</div></div><span class="number">${fmtNum(m.Quantidade)}</span></div>`).join('')||'<div class="empty">Sem movimentações ainda.</div>';
  }

  function renderCategories(){
    const sel=$('#itemCategory'), cur=sel.value; const cats=[...new Set(state.itens.map(i=>i.Categoria).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    sel.innerHTML='<option value="">Todas as categorias</option>'+cats.map(c=>`<option>${esc(c)}</option>`).join(''); sel.value=cur;
  }

  function filteredItems(){
    const q=norm($('#itemSearch').value), cat=$('#itemCategory').value, typ=$('#itemType').value, st=$('#itemStatus').value, loc=norm($('#itemLocation').value);
    return state.itens.filter(i=>itemReal(i)&&(!q||norm([i.Codigo,i.Nome,i.Categoria,i.Localizacao,i.Descricao,itemTypeLabel(i.TipoItem)].join(' ')).includes(q))&&(!cat||i.Categoria===cat)&&(!typ||normalizeItemType(i.TipoItem)===typ)&&(!st||statusItem(i)===st)&&(!loc||norm(i.Localizacao).includes(loc)));
  }

  function renderItems(){
    const rows=filteredItems();
    $('#itemsBody').innerHTML=rows.length?rows.map(i=>{const ativa=num(i.QuantidadeAtual),baixada=num(i.QuantidadeBaixada),total=ativa+baixada;return `<tr><td><div class="item-cell"><div class="item-icon">${esc(i.Icone||'📦')}</div><div><strong>${esc(i.Nome)}</strong><div class="meta">${esc(i.Codigo)}</div></div></div></td><td>${typeBadge(i.TipoItem)}</td><td>${esc(i.Categoria||'—')}</td><td class="number"><strong>${fmtNum(ativa)}</strong></td><td class="number">${fmtNum(baixada)}</td><td class="number"><strong>${fmtNum(total)}</strong></td><td class="number">${fmtNum(i.EstoqueMinimo)}</td><td><span class="location">⌖ ${esc(i.Localizacao||'Não informada')}</span></td><td>${badgeItem(i)}</td><td><div class="row-actions"><button class="mini-btn primary" onclick="almox.adjust('${i.ID}')">Entrada/Reposição</button><button class="mini-btn primary" onclick="almox.loanItem('${i.ID}')">Retirar</button></div></td></tr>`}).join(''):`<tr><td colspan="10" class="empty">Nenhum item encontrado.</td></tr>`;
  }

  function filteredLoans(){
    const q=norm($('#loanSearch').value), st=$('#loanStatus').value, f=$('#loanFrom').value?new Date($('#loanFrom').value+'T00:00:00').getTime():0, t=$('#loanTo').value?new Date($('#loanTo').value+'T23:59:59').getTime():Infinity;
    return state.retiradas.filter(r=>{const overdue=isOverdue(r);const matchSt=!st||(st==='ATRASADA'?overdue:r.Status===st);const ms=dateMs(r.DataRetirada);return (!q||norm([r.ItemNome,r.CodigoItem,r.RetiradoPor,r.ProcessoSEI,r.AdjuntoRetirada,r.AdjuntoDevolucao,r.Finalidade,r.Observacoes].join(' ')).includes(q))&&matchSt&&ms>=f&&ms<=t;});
  }

  function renderLoans(){
    const rows=filteredLoans();
    $('#loansBody').innerHTML=rows.length?rows.map(r=>{
      const consumo=normalizeItemType(r.TipoItem)==='CONSUMO'||r.Status==='CONSUMIDO';
      const pend=consumo?0:Math.max(0,num(r.Quantidade)-num(r.QuantidadeDevolvida));
      const operators=`<strong>Ret.: ${esc(r.AdjuntoRetirada||r.RegistradoPor||'—')}</strong>${r.AdjuntoDevolucao?`<div class="meta">Dev.: ${esc(r.AdjuntoDevolucao)}</div>`:''}`;
      const devAtiva=num(r.QuantidadeDevolvidaAtiva),devBaixada=num(r.QuantidadeDevolvidaBaixada);
      const qty=consumo?`${fmtNum(r.Quantidade)} saída`:`${fmtNum(pend)} pend.<div class="meta">Dev.: ${fmtNum(devAtiva)} ativa / ${fmtNum(devBaixada)} baixada</div>`;
      return `<tr class="${isOverdue(r)?'overdue-row':''}"><td><strong>${esc(r.ItemNome)}</strong><div class="meta">${esc(r.CodigoItem)}</div></td><td>${typeBadge(r.TipoItem)}</td><td><strong>${esc(r.RetiradoPor||'—')}</strong></td><td>${esc(r.ProcessoSEI||'—')}</td><td>${operators}</td><td>${fmtDate(r.DataRetirada)}</td><td>${consumo?'—':(r.PrevistaDevolucao?fmtDate(r.PrevistaDevolucao):'—')}</td><td class="number">${qty}</td><td>${badgeLoan(r)}</td><td>${!consumo&&r.Status!=='DEVOLVIDA'?`<button class="mini-btn primary" onclick="almox.returnLoan('${r.ID}')">Devolver</button>`:'—'}</td></tr>`;
    }).join(''):`<tr><td colspan="10" class="empty">Nenhuma cautela encontrada.</td></tr>`;
  }

  function historyFilters(){
    return {de:$('#moveFrom').value,ate:$('#moveTo').value,item:$('#moveItem').value.trim(),militar:$('#moveMilitary').value.trim(),processo:$('#moveProcess').value.trim(),usuario:$('#moveUser').value.trim(),tipo:$('#moveType').value};
  }

  async function loadHistory(page=1){
    if(!state.token) return;
    setLoading(true);
    try{
      const out=await api('searchHistory',{filters:historyFilters(),page});
      state.history={rows:out.rows||[],page:out.page||1,hasPrevious:!!out.hasPrevious,hasMore:!!out.hasMore,loaded:true};
      renderMoves();
    }catch(err){ toast(err.message,true); }
    finally{ setLoading(false); }
  }

  function clearHistoryFilters(){
    ['moveFrom','moveTo','moveItem','moveMilitary','moveProcess','moveUser'].forEach(id=>$('#'+id).value='');
    $('#moveType').value='';
    loadHistory(1);
  }

  function renderMoves(){
    const rows=state.history.rows||[];
    $('#movesBody').innerHTML=rows.length?rows.map(m=>`<tr><td>${fmtDate(m.DataHora)}</td><td><span class="badge ${m.Tipo==='RETIRADA'?'open':m.Tipo==='DEVOLUCAO'||m.Tipo==='CONSUMO'?'':'off'}">${esc(labelMove(m.Tipo))}</span></td><td><strong>${esc(m.ItemNome||'—')}</strong><div class="meta">${esc(m.CodigoItem||'')}</div></td><td class="number">${fmtNum(m.Quantidade)}</td><td class="number">${m.Tipo==='DEVOLUCAO'?fmtNum(m.DevolvidaAtiva):'—'}</td><td class="number">${m.Tipo==='DEVOLUCAO'?fmtNum(m.DevolvidaBaixada):'—'}</td><td class="number">${fmtNum(m.SaldoAntes)} → ${fmtNum(m.SaldoDepois)}</td><td>${esc(m.Militar||'—')}</td><td>${esc(m.ProcessoSEI||'—')}</td><td>${esc(m.AdjuntoRetirada||'—')}</td><td>${esc(m.AdjuntoDevolucao||'—')}</td><td>${esc(m.UsuarioSistema||'—')}</td><td>${esc(m.Observacao||'—')}</td></tr>`).join(''):`<tr><td colspan="13" class="empty">${state.history.loaded?'Nenhuma movimentação encontrada.':'Abra o Histórico para carregar os registros.'}</td></tr>`;
    $('#historyPageInfo').textContent=`Página ${state.history.page||1} · até 50 registros`;
    $('#historyPrevBtn').disabled=!state.history.hasPrevious;
    $('#historyNextBtn').disabled=!state.history.hasMore;
  }

  function renderUsers(){
    if(!state.user||!isAdmin()) return;
    const usuariosValidos=state.usuarios.filter(u=>String(u.ID||'').trim()&&String(u.Nome||'').trim()&&String(u.Login||'').trim());
    $('#usersBody').innerHTML=usuariosValidos.length?usuariosValidos.map(u=>`<tr><td><strong>${esc(u.Nome)}</strong></td><td>${esc(u.Login)}</td><td><span class="badge open">${esc(u.Perfil)}</span></td><td>${u.Ativo?'<span class="badge">Ativo</span>':'<span class="badge off">Inativo</span>'}</td><td>${u.AtualizadoEm?fmtDate(u.AtualizadoEm):'—'}</td><td><button class="mini-btn" onclick="almox.editUser('${u.ID}')">Editar</button></td></tr>`).join(''):`<tr><td colspan="6" class="empty">Nenhum usuário cadastrado.</td></tr>`;
  }


  function renderAdminItems(){
    if(!state.user||!isAdmin()) return;
    const body=$('#adminItemsBody'); if(!body) return;
    const itens=state.itens.filter(itemReal).sort((a,b)=>String(a.Nome||'').localeCompare(String(b.Nome||''),'pt-BR'));
    body.innerHTML=itens.length?itens.map(i=>`<tr><td><div class="item-cell"><div class="item-icon">${esc(i.Icone||'📦')}</div><div><strong>${esc(i.Nome)}</strong><div class="meta">${esc(i.Codigo||'')}</div></div></div></td><td>${typeBadge(i.TipoItem)}</td><td>${esc(i.Categoria||'—')}</td><td class="number">${fmtNum(i.QuantidadeAtual)}</td><td class="number">${fmtNum(i.QuantidadeBaixada)}</td><td>${esc(i.Localizacao||'—')}</td><td>${badgeItem(i)}</td><td><div class="row-actions"><button class="mini-btn" onclick="almox.editItem('${i.ID}')">Editar</button><button class="mini-btn danger" onclick="almox.deleteItem('${i.ID}')">Excluir</button></div></td></tr>`).join(''):`<tr><td colspan="8" class="empty">Nenhum item cadastrado.</td></tr>`;
  }

  function requestStatusBadge(r){
    return String(r.Status||'PENDENTE').toUpperCase()==='CADASTRADA'
      ? '<span class="badge">Cadastrada</span>'
      : '<span class="badge partial">Pendente</span>';
  }

  function renderRequests(){
    if(!state.user||!isAdmin()) return;
    const body=$('#requestsBody'); if(!body) return;
    const rows=(state.solicitacoes||[]).filter(r=>String(r.ID||'').trim()&&String(r.Nome||'').trim()).sort((a,b)=>dateMs(b.CriadoEm)-dateMs(a.CriadoEm));
    body.innerHTML=rows.length?rows.map(r=>{
      const pending=String(r.Status||'PENDENTE').toUpperCase()!=='CADASTRADA';
      const actions=pending?`<div class="row-actions"><button class="mini-btn" onclick="almox.editRequest('${r.ID}')">Editar</button><button class="mini-btn primary" onclick="almox.registerRequest('${r.ID}')">Cadastrar</button></div>`:`<div class="meta">${r.CodigoItem?'Item '+esc(r.CodigoItem):'Concluída'}</div>`;
      return `<tr><td>${fmtDate(r.CriadoEm)}</td><td><strong>${esc(r.SolicitadoPor||'—')}</strong></td><td><strong>${esc(r.Nome)}</strong><div class="meta">${esc(r.Categoria||'Sem categoria')}</div></td><td>${typeBadge(r.TipoItem)}</td><td class="number">${fmtNum(r.QuantidadeSugerida)}</td><td>${esc(r.Localizacao||'—')}</td><td>${requestStatusBadge(r)}</td><td>${actions}</td></tr>`;
    }).join(''):`<tr><td colspan="8" class="empty">Nenhuma solicitação de cadastro.</td></tr>`;
  }

  function renderEfetivo(){
    if(!state.user||!isAdmin()) return;
    const ta=$('#efetivoTextarea');
    if(!ta) return;
    ta.value=(state.efetivo||[]).join('\n');
    updateEfetivoCount();
  }

  function linhasEfetivo(){
    const ta=$('#efetivoTextarea');
    return (ta?ta.value:'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  }

  function updateEfetivoCount(){
    const el=$('#efetivoCount'); if(!el) return;
    const n=linhasEfetivo().length;
    el.textContent=n + (n===1?' militar':' militares');
  }

  async function saveEfetivo(){
    if(!isAdmin()){toast('Somente o ADMIN pode alterar o efetivo.',true);return}
    setLoading(true);
    try{
      const out=await api('saveEfetivo',{nomes:linhasEfetivo()});
      state.efetivo=out.efetivo||linhasEfetivo();
      renderEfetivo();
      toast(out.message||'Efetivo salvo.');
    }catch(err){toast(err.message,true);}
    finally{setLoading(false);}
  }

  function modalRequest(id){
    const existing=id?(state.solicitacoes||[]).find(x=>x.ID===id):null;
    if(id && !isAdmin()){toast('Somente o ADMIN pode editar solicitações.',true);return}
    const d=existing||{};
    openModal(existing?'Editar solicitação de cadastro':'Solicitar cadastro de item',`<form id="requestForm" class="form-grid">
      <label>Nome do item*<input name="nome" required value="${attr(d.Nome||'')}" placeholder="Ex.: Rádio HT Motorola"></label>
      <label>Categoria<input name="categoria" value="${attr(d.Categoria||'')}" placeholder="Ex.: Comunicações"></label>
      <label>É material de consumo?*<select name="tipoItem" required><option value="CONSUMO" ${normalizeItemType(d.TipoItem)==='CONSUMO'?'selected':''}>Sim — consumo</option><option value="NAO_CONSUMO" ${normalizeItemType(d.TipoItem)!=='CONSUMO'?'selected':''}>Não — material de cautela</option></select></label>
      <label>Quantidade sugerida<input name="quantidadeSugerida" type="number" min="0" step="1" inputmode="numeric" value="${attr(d.QuantidadeSugerida??0)}"><span class="hint">Informe a quantidade conhecida, se houver.</span></label>
      <label>Alerta de estoque baixo sugerido<input name="estoqueMinimoSugerido" type="number" min="0" step="1" inputmode="numeric" value="${attr(d.EstoqueMinimoSugerido??0)}"></label>
      <label>Ícone<input name="icone" value="${attr(d.Icone||'📦')}" maxlength="12" placeholder="📦"></label>
      <label class="full">Localização sugerida<input name="localizacao" value="${attr(d.Localizacao||'')}" placeholder="Ex.: Corredor A > Prateleira 2"></label>
      <label class="full">Descrição / Observações<textarea name="descricao" placeholder="Informações que podem ajudar o ADMIN no cadastro.">${esc(d.Descricao||'')}</textarea></label>
      <div class="section-note full">${existing?'Edite os dados da solicitação antes de cadastrá-la.':'A solicitação será enviada para Configurações de Adm → Solicitações de cadastro. O item só entra no estoque depois que um ADMIN aprovar e cadastrar.'}</div>
      <div class="form-actions"><button type="button" class="btn secondary" onclick="almox.close()">Fechar</button><button class="btn primary">${existing?'Salvar solicitação':'Enviar solicitação'}</button></div>
    </form>`);
    $('#requestForm').addEventListener('submit',async e=>{
      e.preventDefault();
      const f=Object.fromEntries(new FormData(e.target));
      f.ID=id||'';
      f.quantidadeSugerida=num(f.quantidadeSugerida);
      f.estoqueMinimoSugerido=num(f.estoqueMinimoSugerido);
      if(!Number.isInteger(f.quantidadeSugerida)||f.quantidadeSugerida<0||!Number.isInteger(f.estoqueMinimoSugerido)||f.estoqueMinimoSugerido<0){toast('As quantidades devem ser números inteiros iguais ou maiores que zero.',true);return}
      const dupItem=duplicateItemByName(f.nome);
      if(dupItem){toast(`Este item já está cadastrado. Código: ${dupItem.Codigo||'sem código'}.`,true);return}
      const dupReq=duplicatePendingRequestByName(f.nome,id||'');
      if(dupReq){toast('Já existe uma solicitação pendente para este item.',true);return}
      await mutate('saveItemRequest',{request:f});
    });
  }

  function modalItem(id,prefill=null,requestId=''){
    if(!isAdmin()){toast('Somente o ADMIN pode cadastrar ou editar itens.',true);return}
    const current=id?state.itens.find(x=>x.ID===id):null;
    const src=current||prefill||{};
    const qtdInicial=current?'':(src.QuantidadeSugerida!=null?src.QuantidadeSugerida:(src.QuantidadeAtual!=null?src.QuantidadeAtual:0));
    const minimo=src.EstoqueMinimo!=null?src.EstoqueMinimo:(src.EstoqueMinimoSugerido!=null?src.EstoqueMinimoSugerido:0);
    openModal(current?'Editar item':(requestId?'Cadastrar item da solicitação':'Cadastrar novo item'),`<form id="itemForm" class="form-grid">
      <label>Nome*<input name="nome" required value="${attr(src.Nome||'')}"></label><label>Código<input name="codigo" value="${attr(current?.Codigo||'')}" placeholder="Automático se vazio"></label>
      <label>Categoria<input name="categoria" value="${attr(src.Categoria||'')}"></label><label>É material de consumo?*<select name="tipoItem" required><option value="CONSUMO" ${normalizeItemType(src.TipoItem)==='CONSUMO'?'selected':''}>Sim — consumo</option><option value="NAO_CONSUMO" ${normalizeItemType(src.TipoItem)!=='CONSUMO'?'selected':''}>Não — material de cautela</option></select></label>
      ${current?'':`<label>Quantidade ativa em estoque*<input name="quantidadeAtual" type="number" min="0" step="1" required value="${attr(qtdInicial)}" placeholder="Ex.: 25"><span class="hint">Informe quantos itens estão ativos e disponíveis no estoque no momento do cadastro. A quantidade baixada começa em zero.</span></label>`}<label>Alerta de estoque baixo<input name="estoqueMinimo" type="number" min="0" step="1" value="${attr(minimo)}"><span class="hint">O sistema alerta quando a quantidade chegar a este valor ou menos.</span></label>
      <label class="full">Localização no almoxarifado*<input name="localizacao" required value="${attr(src.Localizacao||'')}" placeholder="Ex.: Corredor A > Prateleira 2 > Caixa 3"></label>
      <label>Ícone<input name="icone" value="${attr(src.Icone||'📦')}" maxlength="12" placeholder="📦"></label><label>Status<select name="ativo"><option value="true" ${src.Ativo!==false?'selected':''}>Ativo</option><option value="false" ${src.Ativo===false?'selected':''}>Baixado</option></select></label>
      <label class="full">Descrição<textarea name="descricao">${esc(src.Descricao||'')}</textarea></label>
      ${requestId?'<div class="section-note full">Ao salvar, esta solicitação será marcada automaticamente como <strong>Cadastrada</strong>.</div>':''}
      <div class="form-actions"><button type="button" class="btn secondary" onclick="almox.close()">Fechar</button><button class="btn primary">Salvar</button></div></form>`);
    $('#itemForm').addEventListener('submit',async e=>{
      e.preventDefault();
      const f=Object.fromEntries(new FormData(e.target));
      f.ID=id||''; f.ativo=f.ativo==='true'; f.quantidadeAtual=num(f.quantidadeAtual); f.estoqueMinimo=num(f.estoqueMinimo);
      const dupItem=duplicateItemByName(f.nome,id||'');
      if(dupItem){toast(`Já existe um item cadastrado com este nome. Código: ${dupItem.Codigo||'sem código'}.`,true);return}
      const dupReq=duplicatePendingRequestByName(f.nome,requestId||'');
      if(dupReq){toast('Já existe uma solicitação pendente para este item. Use a solicitação existente ou altere o nome.',true);return}
      await mutate('saveItem',{item:f,solicitacaoId:requestId||''});
    });
  }

  function registerRequest(id){
    if(!isAdmin()) return;
    const r=(state.solicitacoes||[]).find(x=>x.ID===id);
    if(!r){toast('Solicitação não encontrada.',true);return}
    if(String(r.Status||'PENDENTE').toUpperCase()==='CADASTRADA'){toast('Esta solicitação já foi cadastrada.',true);return}
    modalItem('',r,id);
  }

  function modalAdjust(id){
    const i=state.itens.find(x=>x.ID===id); if(!i)return;
    openModal('Entrada / Reposição',`<div class="section-note">${esc(i.Nome)} • ${esc(itemTypeLabel(i.TipoItem))} • ativos: <strong>${fmtNum(i.QuantidadeAtual)}</strong> • baixados: <strong>${fmtNum(i.QuantidadeBaixada)}</strong></div><form id="adjustForm" class="form-grid"><label>Quantidade a adicionar*<input name="valor" type="number" min="1" step="1" inputmode="numeric" required placeholder="Ex.: 10"></label><label class="full">Motivo / Observação*<textarea name="motivo" required placeholder="Ex.: reposição recebida, entrada de novo material..."></textarea></label><div class="form-actions"><button type="button" class="btn secondary" onclick="almox.close()">Fechar</button><button class="btn primary">Registrar entrada</button></div></form>`);
    $('#adjustForm').addEventListener('submit',async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));const valor=num(f.valor);if(!Number.isInteger(valor)||valor<1){toast('Informe uma quantidade inteira maior que zero.',true);return}await mutate('adjustStock',{itemId:id,tipo:'ENTRADA',valor,motivo:f.motivo});});
  }

  function modalLoan(preselect){
    const available=state.itens.filter(i=>i.Ativo!==false&&String(i.Ativo).toLowerCase()!=='false'&&num(i.QuantidadeAtual)>0);
    if(!available.length){toast('Não há item ativo com quantidade disponível.',true);return}
    const now=toLocalInput(new Date());
    openModal('Registrar saída / cautela',`<div class="section-note">Esta operação será registrada automaticamente como feita por <strong>${esc(state.user.Nome)}</strong> (${esc(state.user.Perfil)}).</div><form id="loanForm" class="form-grid">
      <label class="full">Item*<select name="itemId" required><option value="">Selecione...</option>${available.map(i=>`<option value="${i.ID}" ${preselect===i.ID?'selected':''}>${esc(i.Codigo)} — ${esc(i.Nome)} — ${esc(itemTypeLabel(i.TipoItem))} (disponível ${fmtNum(i.QuantidadeAtual)})</option>`).join('')}</select></label>
      <div id="loanTypeInfo" class="section-note full"></div>
      <label>Quantidade*<input name="quantidade" type="number" min="1" step="1" inputmode="numeric" required></label><label>Data da retirada*<input name="dataRetirada" type="datetime-local" value="${now}" required></label>
      <label id="responsavelLabel" class="full"><span id="responsavelLabelText">Retirado por*</span><div class="autocomplete-wrap"><input name="retiradoPor" required autocomplete="off" placeholder="Ex.: Cb QPC 04032 Paulo Tavares FERNANDES"><div id="militarySuggestions" class="autocomplete-list hidden"></div></div><span id="militaryHint" class="hint hidden">Digite qualquer parte do posto/graduação, RG ou nome para ver sugestões do efetivo. Ex.: Cb QPC 04032 Paulo Tavares FERNANDES. Você também pode informar um militar que não esteja cadastrado.</span></label>
      <label class="cautela-only">Número do processo de cautela no SEI*<input name="processoSEI" placeholder="Ex.: 00000.000000/0000-00"></label><label class="cautela-only">Devolução prevista<input name="prevista" type="datetime-local"></label>
      <label class="full">Finalidade / Observações<textarea name="observacoes" placeholder="Informe a finalidade da retirada e qualquer observação necessária."></textarea></label>
      <div class="form-actions"><button type="button" class="btn secondary" onclick="almox.close()">Fechar</button><button class="btn primary">Registrar</button></div></form>`);

    const form=$('#loanForm'), sel=form.querySelector('[name=itemId]');
    const militaryInput=form.querySelector('[name=retiradoPor]');
    const suggestions=$('#militarySuggestions');
    const hideMilitarySuggestions=()=>suggestions.classList.add('hidden');
    const showMilitarySuggestions=()=>{
      const item=state.itens.find(x=>x.ID===sel.value);
      if(!item || normalizeItemType(item.TipoItem)==='CONSUMO'){hideMilitarySuggestions();return}
      const q=norm(militaryInput.value);
      if(!q){hideMilitarySuggestions();return}
      const matches=(state.efetivo||[]).filter(nome=>norm(nome).includes(q)).slice(0,10);
      if(!matches.length){hideMilitarySuggestions();return}
      suggestions.innerHTML=matches.map(nome=>`<button type="button" data-name="${attr(nome)}">${esc(nome)}</button>`).join('');
      suggestions.classList.remove('hidden');
      suggestions.querySelectorAll('button').forEach(btn=>btn.addEventListener('mousedown',e=>{e.preventDefault();militaryInput.value=btn.dataset.name;hideMilitarySuggestions();militaryInput.focus();}));
    };
    militaryInput.addEventListener('input',showMilitarySuggestions);
    militaryInput.addEventListener('focus',showMilitarySuggestions);
    militaryInput.addEventListener('keydown',e=>{if(e.key==='Escape')hideMilitarySuggestions();});
    militaryInput.addEventListener('blur',()=>setTimeout(hideMilitarySuggestions,120));
    const updateType=()=>{
      const item=state.itens.find(x=>x.ID===sel.value), consumo=item&&normalizeItemType(item.TipoItem)==='CONSUMO';
      $('#loanTypeInfo').innerHTML=item?(consumo?'<strong>Material de consumo:</strong> esta saída será definitiva e não ficará aguardando devolução.':'<strong>Material não consumível:</strong> será registrada uma cautela. Militar/RG e número do processo SEI são obrigatórios.'):'Selecione um item para definir o tipo de retirada.';
      $('#responsavelLabelText').textContent=!item||consumo?'Retirado por*':'Militar e RG que fez a cautela*';
      $('#militaryHint').classList.toggle('hidden',!item||consumo);
      if(!item||consumo) hideMilitarySuggestions();
      $$('.cautela-only',form).forEach(el=>el.classList.toggle('hidden',consumo));
      const proc=form.querySelector('[name=processoSEI]'); proc.required=!consumo; if(consumo) proc.value='';
      const prev=form.querySelector('[name=prevista]'); if(consumo) prev.value='';
    };
    sel.addEventListener('change',updateType); updateType();
    form.addEventListener('submit',async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));const loan={itemId:f.itemId,quantidade:num(f.quantidade),retiradoPor:f.retiradoPor,processoSEI:f.processoSEI,observacoes:f.observacoes,dataRetiradaMs:new Date(f.dataRetirada).getTime(),previstaDevolucaoMs:f.prevista?new Date(f.prevista).getTime():null};await mutate('registerLoan',{loan});});
  }

  function modalReturnSelect(){
    const pendentes=state.retiradas.filter(r=>{
      const consumo=normalizeItemType(r.TipoItem)==='CONSUMO'||r.Status==='CONSUMIDO';
      const pend=Math.max(0,num(r.Quantidade)-num(r.QuantidadeDevolvida));
      return !consumo && ['ABERTA','PARCIAL'].includes(r.Status) && pend>0;
    }).sort((a,b)=>dateMs(a.DataRetirada)-dateMs(b.DataRetirada));
    if(!pendentes.length){toast('Não há nenhum item retirado aguardando devolução.',true);return}
    openModal('Devolver item',`<div class="section-note">Selecione uma cautela que ainda possui quantidade pendente. Itens de consumo e cautelas já totalmente devolvidas não aparecem nesta lista.</div><form id="returnSelectForm" class="form-grid">
      <label class="full">Item retirado / cautela*<select name="retiradaId" required><option value="">Selecione...</option>${pendentes.map(r=>{const p=Math.max(0,num(r.Quantidade)-num(r.QuantidadeDevolvida));return `<option value="${r.ID}">${esc(r.ItemNome)} — ${esc(r.RetiradoPor||'Sem militar')} — SEI ${esc(r.ProcessoSEI||'não informado')} — pendente ${fmtNum(p)}</option>`}).join('')}</select></label>
      <div id="returnSelectInfo" class="section-note full">Selecione uma cautela para visualizar os dados.</div>
      <div class="form-actions"><button type="button" class="btn secondary" onclick="almox.close()">Fechar</button><button class="btn primary">Continuar para devolução</button></div>
    </form>`);
    const form=$('#returnSelectForm'), sel=form.querySelector('[name=retiradaId]');
    const update=()=>{
      const r=pendentes.find(x=>x.ID===sel.value);
      if(!r){$('#returnSelectInfo').textContent='Selecione uma cautela para visualizar os dados.';return}
      const p=Math.max(0,num(r.Quantidade)-num(r.QuantidadeDevolvida));
      $('#returnSelectInfo').innerHTML=`<strong>${esc(r.ItemNome)}</strong><br>Militar: ${esc(r.RetiradoPor||'—')} • Processo SEI: ${esc(r.ProcessoSEI||'—')} • Retirada: ${fmtDate(r.DataRetirada)} • Pendente: <strong>${fmtNum(p)}</strong>`;
    };
    sel.addEventListener('change',update);
    form.addEventListener('submit',e=>{e.preventDefault();if(!sel.value)return;modalReturn(sel.value);});
  }

  function modalReturn(id){
    const r=state.retiradas.find(x=>x.ID===id);if(!r)return;
    if(normalizeItemType(r.TipoItem)==='CONSUMO'||r.Status==='CONSUMIDO'){toast('Material de consumo não possui devolução.',true);return}
    const p=Math.max(0,num(r.Quantidade)-num(r.QuantidadeDevolvida));
    const jaAtiva=num(r.QuantidadeDevolvidaAtiva),jaBaixada=num(r.QuantidadeDevolvidaBaixada);
    openModal('Registrar devolução',`<div class="section-note"><strong>${esc(r.ItemNome)}</strong> • militar: ${esc(r.RetiradoPor)}${r.ProcessoSEI?' • processo SEI: '+esc(r.ProcessoSEI):''}<br>Pendente: <strong>${fmtNum(p)}</strong> • já devolvido ativo: <strong>${fmtNum(jaAtiva)}</strong> • já devolvido baixado: <strong>${fmtNum(jaBaixada)}</strong><br>A devolução será registrada como feita por <strong>${esc(state.user.Nome)}</strong>.</div><form id="returnForm" class="form-grid"><label>Quantidade devolvida ATIVA*<input name="quantidadeAtiva" type="number" min="0" max="${p}" step="1" inputmode="numeric" value="${p}" required><span class="hint">Volta para a quantidade disponível no estoque.</span></label><label>Quantidade devolvida BAIXADA*<input name="quantidadeBaixada" type="number" min="0" max="${p}" step="1" inputmode="numeric" value="0" required><span class="hint">Fica contabilizada como baixada e não volta para o estoque disponível.</span></label><div id="returnTotalInfo" class="section-note full"></div><label class="full">Observações<textarea name="observacoes" placeholder="Avaria, motivo da baixa ou outras observações..."></textarea></label><div class="form-actions"><button type="button" class="btn secondary" onclick="almox.close()">Fechar</button><button class="btn primary">Confirmar devolução</button></div></form>`);
    const form=$('#returnForm'), ativa=form.querySelector('[name=quantidadeAtiva]'), baixada=form.querySelector('[name=quantidadeBaixada]'), info=$('#returnTotalInfo');
    const update=()=>{const a=num(ativa.value),b=num(baixada.value),t=a+b,rest=Math.max(0,p-t);info.innerHTML=`Total desta devolução: <strong>${fmtNum(t)}</strong> de ${fmtNum(p)} pendente(s) • continuará pendente: <strong>${fmtNum(rest)}</strong>`;info.classList.toggle('error-note',t>p);};
    ativa.addEventListener('input',update);baixada.addEventListener('input',update);update();
    form.addEventListener('submit',async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));const a=num(f.quantidadeAtiva),b=num(f.quantidadeBaixada);if(!Number.isInteger(a)||!Number.isInteger(b)||a<0||b<0){toast('Informe quantidades inteiras iguais ou maiores que zero.',true);return}if(a+b<=0){toast('Informe ao menos uma unidade devolvida.',true);return}if(a+b>p){toast('A soma de Ativas e Baixadas não pode ultrapassar a quantidade pendente.',true);return}await mutate('registerReturn',{retiradaId:id,quantidadeAtiva:a,quantidadeBaixada:b,observacoes:f.observacoes});});
  }

  function modalDeleteItem(id){
    if(!isAdmin()){toast('Somente o ADMIN pode excluir itens.',true);return}
    const i=(state.itens||[]).find(x=>String(x.ID)===String(id));
    if(!i){toast('Item não encontrado.',true);return}
    const abertas=(state.retiradas||[]).filter(r=>String(r.ItemID)===String(id)&&['ABERTA','PARCIAL'].includes(String(r.Status||'').toUpperCase())&&Math.max(0,num(r.Quantidade)-num(r.QuantidadeDevolvida))>0);
    if(abertas.length){
      const pend=abertas.reduce((t,r)=>t+Math.max(0,num(r.Quantidade)-num(r.QuantidadeDevolvida)),0);
      openModal('Excluir item',`<div class="form-grid"><div class="section-note full error-note"><strong>Este item não pode ser excluído agora.</strong><br>Existem ${abertas.length} cautela(s) em aberto/parcial, com ${fmtNum(pend)} unidade(s) ainda pendente(s) de devolução. Finalize essas cautelas antes de excluir o item.</div><div class="form-actions"><button type="button" class="btn secondary" onclick="almox.close()">Fechar</button></div></div>`);
      return;
    }
    const ativa=num(i.QuantidadeAtual),baixada=num(i.QuantidadeBaixada);
    openModal('Excluir item',`<form id="deleteItemForm" class="form-grid"><div class="section-note full"><strong>${esc(i.Nome)}</strong>${i.Codigo?` • ${esc(i.Codigo)}`:''}<br>Quantidade ativa: <strong>${fmtNum(ativa)}</strong> • quantidade baixada: <strong>${fmtNum(baixada)}</strong>.</div><div class="section-note full error-note"><strong>Atenção:</strong> o item será removido do controle atual do almoxarifado. As movimentações já registradas continuarão preservadas no Histórico.</div><div class="form-actions"><button type="button" class="btn secondary" onclick="almox.close()">Fechar</button><button class="btn danger">Excluir item</button></div></form>`);
    $('#deleteItemForm').addEventListener('submit',async e=>{e.preventDefault();await mutate('deleteItem',{itemId:id});});
  }

  function modalUser(id){
    if(!isAdmin()){toast('Somente o administrador pode gerenciar usuários.',true);return}
    const u=id?state.usuarios.find(x=>x.ID===id):null;
    openModal(u?'Editar usuário':'Novo usuário',`<form id="userForm" class="form-grid"><label>Nome*<input name="nome" required value="${attr(u?.Nome||'')}"></label><label>Login*<input name="login" required value="${attr(u?.Login||'')}"></label><label>Perfil<select name="perfil">${['ADMIN','ADJUNTO'].map(p=>`<option ${p===(u?.Perfil||'ADJUNTO')?'selected':''}>${p}</option>`).join('')}</select></label><label>Status<select name="ativo"><option value="true">Ativo</option><option value="false">Inativo</option></select></label><label class="full">${u?'Novo PIN (deixe vazio para manter)':'PIN*'}<input name="pin" type="password" inputmode="numeric" ${u?'':'required'}><span class="hint">De 4 a 10 dígitos numéricos.</span></label><div class="form-actions"><button type="button" class="btn secondary" onclick="almox.close()">Fechar</button><button class="btn primary">Salvar</button></div></form>`);
    if(u) $('#userForm [name=ativo]').value=String(u.Ativo!==false);
    $('#userForm').addEventListener('submit',async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));f.ID=id||'';f.ativo=f.ativo==='true';await mutate('saveUser',{user:f});});
  }

  function modalChangePin(){
    openModal('Alterar meu PIN',`<form id="pinForm" class="form-grid"><label>PIN atual<input name="pinAtual" type="password" inputmode="numeric" required></label><label>Novo PIN<input name="novoPin" type="password" inputmode="numeric" required></label><label class="full">Confirmar novo PIN<input name="confirmar" type="password" inputmode="numeric" required></label><div class="form-actions"><button type="button" class="btn secondary" onclick="almox.close()">Fechar</button><button class="btn primary">Alterar PIN</button></div></form>`);
    $('#pinForm').addEventListener('submit',async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));if(f.novoPin!==f.confirmar){toast('A confirmação do novo PIN não confere.',true);return}await mutate('changePin',{pinAtual:f.pinAtual,novoPin:f.novoPin},false);closeModal();toast('PIN alterado com sucesso.');});
  }

  async function mutate(action,data,doRefresh=true){ setLoading(true);try{const out=await api(action,data);closeModal();toast(out.message||'Concluído.');if(doRefresh)await refresh();}catch(err){toast(err.message,true);}finally{setLoading(false)} }
  function openModal(title,html){$('#modalTitle').textContent=title;$('#modalContent').innerHTML=html;$('#modal').classList.remove('hidden')}
  function closeModal(){$('#modal').classList.add('hidden');$('#modalContent').innerHTML=''}
  function toast(msg,error=false){const t=$('#toast');t.textContent=msg;t.classList.toggle('error',error);t.classList.remove('hidden');clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.add('hidden'),4200)}
  function setLoading(on){$('#loading').classList.toggle('hidden',!on)}

  function itemReal(i){return !!(String(i?.ID||'').trim()||String(i?.Codigo||'').trim()||String(i?.Nome||'').trim())}
  function normalizeItemType(v){return String(v||'NAO_CONSUMO').toUpperCase()==='CONSUMO'?'CONSUMO':'NAO_CONSUMO'}
  function itemTypeLabel(v){return normalizeItemType(v)==='CONSUMO'?'Consumo':'Não consumo / cautela'}
  function typeBadge(v){return normalizeItemType(v)==='CONSUMO'?'<span class="badge">Consumo</span>':'<span class="badge open">Cautela</span>'}
  function statusItem(i){if(i.Ativo===false||String(i.Ativo).toLowerCase()==='false')return'BAIXADO';const q=num(i.QuantidadeAtual),m=num(i.EstoqueMinimo);return q<=0?'ZERADO':q<=m?'BAIXO':'NORMAL'}
  function badgeItem(i){const s=statusItem(i);return s==='BAIXADO'?'<span class="badge off">Baixado</span>':s==='ZERADO'?'<span class="badge zero">Zerado</span>':s==='BAIXO'?'<span class="badge low">Baixo</span>':'<span class="badge">Normal</span>'}
  function isOverdue(r){return ['ABERTA','PARCIAL'].includes(r.Status)&&r.PrevistaDevolucao&&dateMs(r.PrevistaDevolucao)<Date.now()}
  function badgeLoan(r){if(r.Status==='CONSUMIDO')return'<span class="badge">Consumo</span>';if(r.Status==='DEVOLVIDA')return'<span class="badge">Devolvida</span>';if(isOverdue(r))return'<span class="badge overdue">Atrasada</span>';if(r.Status==='PARCIAL')return'<span class="badge partial">Parcial</span>';return'<span class="badge open">Cautela aberta</span>'}
  function labelMove(t){return({RETIRADA:'Cautela',CONSUMO:'Consumo',DEVOLUCAO:'Devolução',ENTRADA:'Entrada',AJUSTE:'Ajuste',CADASTRO_ITEM:'Cadastro de item',EDICAO_ITEM:'Edição de item',EXCLUSAO_ITEM:'Exclusão de item',REGISTRO_LEGADO:'Registro migrado',ENTRADA_INICIAL:'Entrada inicial'})[t]||t}
  function moveIcon(t){return({RETIRADA:'↗',CONSUMO:'↗',DEVOLUCAO:'↙',ENTRADA:'＋',AJUSTE:'⚙',CADASTRO_ITEM:'📦',EDICAO_ITEM:'✎',EXCLUSAO_ITEM:'🗑',REGISTRO_LEGADO:'☷',ENTRADA_INICIAL:'📦'})[t]||'•'}

  function exportItems(){const rows=filteredItems().map(i=>{const ativa=num(i.QuantidadeAtual),baixada=num(i.QuantidadeBaixada);return {Codigo:i.Codigo,Nome:i.Nome,Tipo:itemTypeLabel(i.TipoItem),Categoria:i.Categoria,QuantidadeAtiva:ativa,QuantidadeBaixada:baixada,QuantidadeTotal:ativa+baixada,AlertaEstoqueBaixoEmOuMenos:i.EstoqueMinimo,Localizacao:i.Localizacao,Status:statusItem(i),Descricao:i.Descricao}});downloadCSV('itens_almox.csv',rows)}
  function exportLoans(){const rows=filteredLoans().map(r=>({Item:r.ItemNome,Codigo:r.CodigoItem,Tipo:itemTypeLabel(r.TipoItem),Quantidade:r.Quantidade,Devolvida:r.QuantidadeDevolvida,DevolvidaAtiva:r.QuantidadeDevolvidaAtiva,DevolvidaBaixada:r.QuantidadeDevolvidaBaixada,MilitarERG:r.RetiradoPor,ProcessoSEI:r.ProcessoSEI,AdjuntoRetirada:r.AdjuntoRetirada,AdjuntoDevolucao:r.AdjuntoDevolucao,DataRetirada:fmtDate(r.DataRetirada),Prevista:fmtDate(r.PrevistaDevolucao),DataDevolucao:fmtDate(r.DataDevolucao),Status:isOverdue(r)?'ATRASADA':r.Status,FinalidadeObservacoes:[r.Finalidade,r.Observacoes].filter(Boolean).join(' | ')}));downloadCSV('cautelas_almox.csv',rows)}
  function downloadCSV(name,rows){if(!rows.length){toast('Não há dados para exportar.',true);return}const keys=Object.keys(rows[0]);const safe=v=>{let x=String(v??'');if(/^[=+\-@]/.test(x))x="'"+x;return '"'+x.replace(/"/g,'""')+'"'};const csv='\ufeff'+[keys.join(';'),...rows.map(r=>keys.map(k=>safe(r[k])).join(';'))].join('\r\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}

  function fmtDate(v){if(!v)return'—';const d=new Date(v);return isNaN(d)?'—':new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(d)}
  function fmtNum(v){return new Intl.NumberFormat('pt-BR',{maximumFractionDigits:0}).format(num(v))}
  function num(v){const n=Number(String(v??0).replace(',','.'));return Number.isFinite(n)?n:0}
  function dateMs(v){const d=new Date(v);return isNaN(d)?0:d.getTime()}
  function norm(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()}
  function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
  function attr(v){return esc(v)}
  function toLocalInput(d){const p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`}

  window.almox={ editItem:modalItem, deleteItem:modalDeleteItem, editRequest:modalRequest, registerRequest, adjust:modalAdjust, loanItem:modalLoan, returnLoan:modalReturn, editUser:modalUser, close:closeModal };
})();
