(() => {
  const API = (window.ALMC_CONFIG && window.ALMC_CONFIG.API_URL || '').trim();
  const PLACEHOLDER = 'COLE_AQUI_A_URL_DO_APPS_SCRIPT_EXEC';
  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];
  const state = { token: localStorage.getItem('almox_token') || '', user:null, config:{}, itens:[], retiradas:[], movimentos:[], usuarios:[], efetivo:[], dashboard:{}, currentView:'dashboard', configTab:'usuarios', history:{rows:[],page:1,hasPrevious:false,hasMore:false,loaded:false} };

  function normalizedRole(v){ return String(v || '').trim().toUpperCase(); }
  function isAdmin(){ return normalizedRole(state.user?.Perfil) === 'ADMIN'; }

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
    $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
    $('#menuBtn').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
    $$('#nav [data-view]').forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));
    $$('[data-goto]').forEach(b => b.addEventListener('click', () => switchView(b.dataset.goto)));
    $('#globalSearch').addEventListener('input', e => { switchView('itens'); $('#itemSearch').value=e.target.value; renderItems(); });
    $('#newItemBtn').addEventListener('click', () => modalItem());
    $('#quickItemBtn').addEventListener('click', () => modalItem());
    $('#newLoanBtn').addEventListener('click', () => modalLoan());
    $('#quickLoanBtn').addEventListener('click', () => modalLoan());
    $('#returnItemBtn').addEventListener('click', modalReturnSelect);
    $('#quickReturnBtn').addEventListener('click', modalReturnSelect);
    $('#newUserBtn').addEventListener('click', () => modalUser());
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
      Object.assign(state,{user:out.user,config:out.config||{},itens:out.itens||[],retiradas:out.retiradas||[],movimentos:out.movimentos||[],usuarios:out.usuarios||[],efetivo:out.efetivo||[],dashboard:out.dashboard||{}});
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
    $('#brandName').textContent=state.config.nomeSistema||'Controle de Almoxarifado'; $('#brandUnit').textContent=state.config.unidade||'Almoxarifado';
    $('#userName').textContent=state.user.Nome; $('#userRole').textContent=state.user.Perfil; $('#userInitial').textContent=(state.user.Nome||'U').trim().charAt(0).toUpperCase();
    const admin=isAdmin();
    $$('.admin-only').forEach(x=>x.classList.toggle('hidden',!admin));
    $$('.can-write').forEach(x=>x.classList.remove('hidden'));
    if(!admin && state.currentView==='configuracoes') switchView('dashboard');
  }

  function renderAll(){ renderDashboard(); renderCategories(); renderItems(); renderLoans(); renderMoves(); renderUsers(); renderEfetivo(); }
  function switchView(name){
    if(name==='configuracoes' && !isAdmin()){
      toast('A área de configurações é exclusiva do perfil ADMIN.', true);
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
    if(name==='configuracoes') { renderUsers(); renderEfetivo(); switchConfigTab(state.configTab || 'usuarios'); }
    if(name==='historico' && !state.history.loaded) loadHistory(1);
  }

  function switchConfigTab(tab){
    if(!isAdmin()) return;
    state.configTab = tab === 'efetivo' ? 'efetivo' : 'usuarios';
    $$('.config-tab').forEach(b=>b.classList.toggle('active', b.dataset.configTab===state.configTab));
    $$('.config-panel').forEach(p=>p.classList.remove('active-config-panel'));
    const panel=$('#config-'+state.configTab);
    if(panel) panel.classList.add('active-config-panel');
    if(state.configTab==='usuarios') renderUsers(); else renderEfetivo();
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
    return state.itens.filter(i=>(!q||norm([i.Codigo,i.Nome,i.Categoria,i.Localizacao,i.Descricao,itemTypeLabel(i.TipoItem)].join(' ')).includes(q))&&(!cat||i.Categoria===cat)&&(!typ||normalizeItemType(i.TipoItem)===typ)&&(!st||statusItem(i)===st)&&(!loc||norm(i.Localizacao).includes(loc)));
  }

  function renderItems(){
    const rows=filteredItems();
    $('#itemsBody').innerHTML=rows.length?rows.map(i=>`<tr><td><div class="item-cell"><div class="item-icon">${esc(i.Icone||'📦')}</div><div><strong>${esc(i.Nome)}</strong><div class="meta">${esc(i.Codigo)}</div></div></div></td><td>${typeBadge(i.TipoItem)}</td><td>${esc(i.Categoria||'—')}</td><td class="number"><strong>${fmtNum(i.QuantidadeAtual)}</strong> ${esc(i.Unidade||'UN')}</td><td class="number">${fmtNum(i.EstoqueMinimo)}</td><td><span class="location">⌖ ${esc(i.Localizacao||'Não informada')}</span></td><td>${badgeItem(i)}</td><td><div class="row-actions"><button class="mini-btn" onclick="almox.editItem('${i.ID}')">Editar</button><button class="mini-btn primary" onclick="almox.adjust('${i.ID}')">Estoque</button><button class="mini-btn primary" onclick="almox.loanItem('${i.ID}')">Retirar</button></div></td></tr>`).join(''):`<tr><td colspan="8" class="empty">Nenhum item encontrado.</td></tr>`;
  }

  function filteredLoans(){
    const q=norm($('#loanSearch').value), st=$('#loanStatus').value, f=$('#loanFrom').value?new Date($('#loanFrom').value+'T00:00:00').getTime():0, t=$('#loanTo').value?new Date($('#loanTo').value+'T23:59:59').getTime():Infinity;
    return state.retiradas.filter(r=>{const overdue=isOverdue(r);const matchSt=!st||(st==='ATRASADA'?overdue:r.Status===st);const ms=dateMs(r.DataRetirada);return (!q||norm([r.ItemNome,r.CodigoItem,r.RetiradoPor,r.Matricula,r.Setor,r.ProcessoSEI,r.AdjuntoRetirada,r.AdjuntoDevolucao,r.Finalidade].join(' ')).includes(q))&&matchSt&&ms>=f&&ms<=t;});
  }

  function renderLoans(){
    const rows=filteredLoans();
    $('#loansBody').innerHTML=rows.length?rows.map(r=>{
      const consumo=normalizeItemType(r.TipoItem)==='CONSUMO'||r.Status==='CONSUMIDO';
      const pend=consumo?0:Math.max(0,num(r.Quantidade)-num(r.QuantidadeDevolvida));
      const operators=`<strong>Ret.: ${esc(r.AdjuntoRetirada||r.RegistradoPor||'—')}</strong>${r.AdjuntoDevolucao?`<div class="meta">Dev.: ${esc(r.AdjuntoDevolucao)}</div>`:''}`;
      const qty=consumo?`${fmtNum(r.Quantidade)} saída`:`${fmtNum(pend)} pend.`;
      return `<tr class="${isOverdue(r)?'overdue-row':''}"><td><strong>${esc(r.ItemNome)}</strong><div class="meta">${esc(r.CodigoItem)}</div></td><td>${typeBadge(r.TipoItem)}</td><td><strong>${esc(r.RetiradoPor||'—')}</strong><div class="meta">${esc([r.Matricula,r.Setor].filter(Boolean).join(' • '))}</div></td><td>${esc(r.ProcessoSEI||'—')}</td><td>${operators}</td><td>${fmtDate(r.DataRetirada)}</td><td>${consumo?'—':(r.PrevistaDevolucao?fmtDate(r.PrevistaDevolucao):'—')}</td><td class="number">${qty}</td><td>${badgeLoan(r)}</td><td>${!consumo&&r.Status!=='DEVOLVIDA'?`<button class="mini-btn primary" onclick="almox.returnLoan('${r.ID}')">Devolver</button>`:'—'}</td></tr>`;
    }).join(''):`<tr><td colspan="10" class="empty">Nenhuma retirada encontrada.</td></tr>`;
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
    $('#movesBody').innerHTML=rows.length?rows.map(m=>`<tr><td>${fmtDate(m.DataHora)}</td><td><span class="badge ${m.Tipo==='RETIRADA'?'open':m.Tipo==='DEVOLUCAO'||m.Tipo==='CONSUMO'?'':'off'}">${esc(labelMove(m.Tipo))}</span></td><td><strong>${esc(m.ItemNome||'—')}</strong><div class="meta">${esc(m.CodigoItem||'')}</div></td><td class="number">${fmtNum(m.Quantidade)}</td><td class="number">${fmtNum(m.SaldoAntes)} → ${fmtNum(m.SaldoDepois)}</td><td>${esc(m.Militar||'—')}<div class="meta">${esc([m.Matricula,m.Setor].filter(Boolean).join(' • '))}</div></td><td>${esc(m.ProcessoSEI||'—')}</td><td>${esc(m.AdjuntoRetirada||'—')}</td><td>${esc(m.AdjuntoDevolucao||'—')}</td><td>${esc(m.UsuarioSistema||'—')}</td><td>${esc(m.Observacao||'—')}</td></tr>`).join(''):`<tr><td colspan="11" class="empty">${state.history.loaded?'Nenhuma movimentação encontrada.':'Abra o Histórico para carregar os registros.'}</td></tr>`;
    $('#historyPageInfo').textContent=`Página ${state.history.page||1} · até 50 registros`;
    $('#historyPrevBtn').disabled=!state.history.hasPrevious;
    $('#historyNextBtn').disabled=!state.history.hasMore;
  }

  function renderUsers(){
    if(!state.user||!isAdmin()) return;
    $('#usersBody').innerHTML=state.usuarios.length?state.usuarios.map(u=>`<tr><td><strong>${esc(u.Nome)}</strong></td><td>${esc(u.Login)}</td><td><span class="badge open">${esc(u.Perfil)}</span></td><td>${u.Ativo?'<span class="badge">Ativo</span>':'<span class="badge off">Inativo</span>'}</td><td>${u.AtualizadoEm?fmtDate(u.AtualizadoEm):'—'}</td><td><button class="mini-btn" onclick="almox.editUser('${u.ID}')">Editar</button></td></tr>`).join(''):`<tr><td colspan="6" class="empty">Nenhum usuário.</td></tr>`;
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

  function modalItem(id){
    const i=id?state.itens.find(x=>x.ID===id):null;
    openModal(i?'Editar item':'Novo item',`<form id="itemForm" class="form-grid">
      <label>Nome*<input name="nome" required value="${attr(i?.Nome||'')}"></label><label>Código<input name="codigo" value="${attr(i?.Codigo||'')}" placeholder="Automático se vazio"></label>
      <label>Categoria<input name="categoria" value="${attr(i?.Categoria||'')}"></label><label>É material de consumo?*<select name="tipoItem" required><option value="CONSUMO" ${normalizeItemType(i?.TipoItem)==='CONSUMO'?'selected':''}>Sim — consumo</option><option value="NAO_CONSUMO" ${normalizeItemType(i?.TipoItem)!=='CONSUMO'?'selected':''}>Não — material de cautela</option></select></label>
      <label>Unidade<select name="unidade">${['UN','PC','CX','JG','PAR','M','KG','L'].map(x=>`<option ${x===(i?.Unidade||'UN')?'selected':''}>${x}</option>`).join('')}</select></label>
      ${i?'':`<label>Saldo inicial<input name="quantidadeAtual" type="number" min="0" step="0.01" value="0"><span class="hint">Depois do cadastro, altere saldo por “Estoque”.</span></label>`}<label>Estoque mínimo<input name="estoqueMinimo" type="number" min="0" step="0.01" value="${attr(i?.EstoqueMinimo??0)}"></label>
      <label class="full">Localização no almoxarifado*<input name="localizacao" required value="${attr(i?.Localizacao||'')}" placeholder="Ex.: Corredor A > Prateleira 2 > Caixa 3"></label>
      <label>Ícone<input name="icone" value="${attr(i?.Icone||'📦')}" maxlength="12" placeholder="📦"></label><label>Status<select name="ativo"><option value="true" ${i?.Ativo!==false?'selected':''}>Ativo</option><option value="false" ${i?.Ativo===false?'selected':''}>Inativo</option></select></label>
      <label class="full">Descrição<textarea name="descricao">${esc(i?.Descricao||'')}</textarea></label><div class="form-actions"><button type="button" class="btn secondary" onclick="almox.close()">Cancelar</button><button class="btn primary">Salvar</button></div></form>`);
    $('#itemForm').addEventListener('submit',async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));f.ID=id||'';f.ativo=f.ativo==='true';f.quantidadeAtual=num(f.quantidadeAtual);f.estoqueMinimo=num(f.estoqueMinimo);await mutate('saveItem',{item:f});});
  }

  function modalAdjust(id){
    const i=state.itens.find(x=>x.ID===id); if(!i)return;
    openModal('Ajustar estoque',`<div class="section-note">${esc(i.Nome)} • ${esc(itemTypeLabel(i.TipoItem))} • saldo atual: <strong>${fmtNum(i.QuantidadeAtual)} ${esc(i.Unidade||'UN')}</strong></div><form id="adjustForm" class="form-grid"><label>Tipo<select name="tipo"><option value="ENTRADA">Entrada / reposição</option><option value="SAIDA_AJUSTE">Saída por ajuste</option><option value="DEFINIR_SALDO">Definir saldo exato</option></select></label><label>Quantidade / novo saldo<input name="valor" type="number" min="0" step="0.01" required></label><label class="full">Motivo*<textarea name="motivo" required placeholder="Ex.: conferência física, recebimento, perda, correção..."></textarea></label><div class="form-actions"><button type="button" class="btn secondary" onclick="almox.close()">Cancelar</button><button class="btn primary">Confirmar</button></div></form>`);
    $('#adjustForm').addEventListener('submit',async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));await mutate('adjustStock',{itemId:id,tipo:f.tipo,valor:num(f.valor),motivo:f.motivo});});
  }

  function modalLoan(preselect){
    const available=state.itens.filter(i=>i.Ativo!==false&&String(i.Ativo).toLowerCase()!=='false'&&num(i.QuantidadeAtual)>0);
    if(!available.length){toast('Não há item ativo com saldo disponível.',true);return}
    const now=toLocalInput(new Date());
    openModal('Registrar retirada',`<div class="section-note">Esta operação será registrada automaticamente como feita por <strong>${esc(state.user.Nome)}</strong> (${esc(state.user.Perfil)}).</div><form id="loanForm" class="form-grid">
      <label class="full">Item*<select name="itemId" required><option value="">Selecione...</option>${available.map(i=>`<option value="${i.ID}" ${preselect===i.ID?'selected':''}>${esc(i.Codigo)} — ${esc(i.Nome)} — ${esc(itemTypeLabel(i.TipoItem))} (saldo ${fmtNum(i.QuantidadeAtual)})</option>`).join('')}</select></label>
      <div id="loanTypeInfo" class="section-note full"></div>
      <label>Quantidade*<input name="quantidade" type="number" min="0.01" step="0.01" required></label><label>Data da retirada*<input name="dataRetirada" type="datetime-local" value="${now}" required></label>
      <label id="responsavelLabel"><span id="responsavelLabelText">Retirado por*</span><div class="autocomplete-wrap"><input name="retiradoPor" required autocomplete="off"><div id="militarySuggestions" class="autocomplete-list hidden"></div></div><span id="militaryHint" class="hint hidden">Digite qualquer parte do nome para ver sugestões do efetivo. Você também pode informar um nome que não esteja cadastrado.</span></label><label>Matrícula / identificação<input name="matricula"></label><label>Setor<input name="setor"></label>
      <label class="cautela-only">Número do processo de cautela no SEI*<input name="processoSEI" placeholder="Ex.: 00000.000000/0000-00"></label><label class="cautela-only">Devolução prevista<input name="prevista" type="datetime-local"></label>
      <label class="full">Finalidade<input name="finalidade" placeholder="Motivo da retirada"></label><label class="full">Observações<textarea name="observacoes"></textarea></label>
      <div class="form-actions"><button type="button" class="btn secondary" onclick="almox.close()">Cancelar</button><button class="btn primary">Registrar retirada</button></div></form>`);

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
      $('#loanTypeInfo').innerHTML=item?(consumo?'<strong>Material de consumo:</strong> esta saída será definitiva e não ficará aguardando devolução.':'<strong>Material não consumível:</strong> será registrada uma cautela. Militar e número do processo SEI são obrigatórios.'):'Selecione um item para definir o tipo de retirada.';
      $('#responsavelLabelText').textContent=!item||consumo?'Retirado por*':'Militar que fez a cautela*';
      $('#militaryHint').classList.toggle('hidden',!item||consumo);
      if(!item||consumo) hideMilitarySuggestions();
      $$('.cautela-only',form).forEach(el=>el.classList.toggle('hidden',consumo));
      const proc=form.querySelector('[name=processoSEI]'); proc.required=!consumo; if(consumo) proc.value='';
      const prev=form.querySelector('[name=prevista]'); if(consumo) prev.value='';
    };
    sel.addEventListener('change',updateType); updateType();
    form.addEventListener('submit',async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));const loan={itemId:f.itemId,quantidade:num(f.quantidade),retiradoPor:f.retiradoPor,matricula:f.matricula,setor:f.setor,processoSEI:f.processoSEI,finalidade:f.finalidade,observacoes:f.observacoes,dataRetiradaMs:new Date(f.dataRetirada).getTime(),previstaDevolucaoMs:f.prevista?new Date(f.prevista).getTime():null};await mutate('registerLoan',{loan});});
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
      <div class="form-actions"><button type="button" class="btn secondary" onclick="almox.close()">Cancelar</button><button class="btn primary">Continuar para devolução</button></div>
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
    openModal('Registrar devolução',`<div class="section-note"><strong>${esc(r.ItemNome)}</strong> • militar: ${esc(r.RetiradoPor)}${r.ProcessoSEI?' • processo SEI: '+esc(r.ProcessoSEI):''} • pendente: <strong>${fmtNum(p)}</strong><br>A devolução será registrada como feita por <strong>${esc(state.user.Nome)}</strong>.</div><form id="returnForm" class="form-grid"><label>Quantidade devolvida*<input name="quantidade" type="number" min="0.01" max="${p}" step="0.01" value="${p}" required></label><label class="full">Observações<textarea name="observacoes" placeholder="Estado do item, avaria, observações..."></textarea></label><div class="form-actions"><button type="button" class="btn secondary" onclick="almox.close()">Cancelar</button><button class="btn primary">Confirmar devolução</button></div></form>`);
    $('#returnForm').addEventListener('submit',async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));await mutate('registerReturn',{retiradaId:id,quantidade:num(f.quantidade),observacoes:f.observacoes});});
  }

  function modalUser(id){
    if(!isAdmin()){toast('Somente o administrador pode gerenciar usuários.',true);return}
    const u=id?state.usuarios.find(x=>x.ID===id):null;
    openModal(u?'Editar usuário':'Novo usuário',`<form id="userForm" class="form-grid"><label>Nome*<input name="nome" required value="${attr(u?.Nome||'')}"></label><label>Login*<input name="login" required value="${attr(u?.Login||'')}"></label><label>Perfil<select name="perfil">${['ADMIN','ADJUNTO'].map(p=>`<option ${p===(u?.Perfil||'ADJUNTO')?'selected':''}>${p}</option>`).join('')}</select></label><label>Status<select name="ativo"><option value="true">Ativo</option><option value="false">Inativo</option></select></label><label class="full">${u?'Novo PIN (deixe vazio para manter)':'PIN*'}<input name="pin" type="password" inputmode="numeric" ${u?'':'required'}><span class="hint">De 4 a 10 dígitos numéricos.</span></label><div class="form-actions"><button type="button" class="btn secondary" onclick="almox.close()">Cancelar</button><button class="btn primary">Salvar</button></div></form>`);
    if(u) $('#userForm [name=ativo]').value=String(u.Ativo!==false);
    $('#userForm').addEventListener('submit',async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));f.ID=id||'';f.ativo=f.ativo==='true';await mutate('saveUser',{user:f});});
  }

  function modalChangePin(){
    openModal('Alterar meu PIN',`<form id="pinForm" class="form-grid"><label>PIN atual<input name="pinAtual" type="password" inputmode="numeric" required></label><label>Novo PIN<input name="novoPin" type="password" inputmode="numeric" required></label><label class="full">Confirmar novo PIN<input name="confirmar" type="password" inputmode="numeric" required></label><div class="form-actions"><button type="button" class="btn secondary" onclick="almox.close()">Cancelar</button><button class="btn primary">Alterar PIN</button></div></form>`);
    $('#pinForm').addEventListener('submit',async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));if(f.novoPin!==f.confirmar){toast('A confirmação do novo PIN não confere.',true);return}await mutate('changePin',{pinAtual:f.pinAtual,novoPin:f.novoPin},false);closeModal();toast('PIN alterado com sucesso.');});
  }

  async function mutate(action,data,doRefresh=true){ setLoading(true);try{const out=await api(action,data);closeModal();toast(out.message||'Concluído.');if(doRefresh)await refresh();}catch(err){toast(err.message,true);}finally{setLoading(false)} }
  function openModal(title,html){$('#modalTitle').textContent=title;$('#modalContent').innerHTML=html;$('#modal').classList.remove('hidden')}
  function closeModal(){$('#modal').classList.add('hidden');$('#modalContent').innerHTML=''}
  function toast(msg,error=false){const t=$('#toast');t.textContent=msg;t.classList.toggle('error',error);t.classList.remove('hidden');clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.add('hidden'),4200)}
  function setLoading(on){$('#loading').classList.toggle('hidden',!on)}

  function normalizeItemType(v){return String(v||'NAO_CONSUMO').toUpperCase()==='CONSUMO'?'CONSUMO':'NAO_CONSUMO'}
  function itemTypeLabel(v){return normalizeItemType(v)==='CONSUMO'?'Consumo':'Não consumo / cautela'}
  function typeBadge(v){return normalizeItemType(v)==='CONSUMO'?'<span class="badge">Consumo</span>':'<span class="badge open">Cautela</span>'}
  function statusItem(i){if(i.Ativo===false||String(i.Ativo).toLowerCase()==='false')return'INATIVO';const q=num(i.QuantidadeAtual),m=num(i.EstoqueMinimo);return q<=0?'ZERADO':q<=m?'BAIXO':'NORMAL'}
  function badgeItem(i){const s=statusItem(i);return s==='INATIVO'?'<span class="badge off">Inativo</span>':s==='ZERADO'?'<span class="badge zero">Zerado</span>':s==='BAIXO'?'<span class="badge low">Baixo</span>':'<span class="badge">Normal</span>'}
  function isOverdue(r){return ['ABERTA','PARCIAL'].includes(r.Status)&&r.PrevistaDevolucao&&dateMs(r.PrevistaDevolucao)<Date.now()}
  function badgeLoan(r){if(r.Status==='CONSUMIDO')return'<span class="badge">Consumo</span>';if(r.Status==='DEVOLVIDA')return'<span class="badge">Devolvida</span>';if(isOverdue(r))return'<span class="badge overdue">Atrasada</span>';if(r.Status==='PARCIAL')return'<span class="badge partial">Parcial</span>';return'<span class="badge open">Cautela aberta</span>'}
  function labelMove(t){return({RETIRADA:'Cautela',CONSUMO:'Consumo',DEVOLUCAO:'Devolução',ENTRADA:'Entrada',AJUSTE:'Ajuste',CADASTRO_ITEM:'Cadastro de item',EDICAO_ITEM:'Edição de item',REGISTRO_LEGADO:'Registro migrado',ENTRADA_INICIAL:'Entrada inicial'})[t]||t}
  function moveIcon(t){return({RETIRADA:'↗',CONSUMO:'↗',DEVOLUCAO:'↙',ENTRADA:'＋',AJUSTE:'⚙',CADASTRO_ITEM:'📦',EDICAO_ITEM:'✎',REGISTRO_LEGADO:'☷',ENTRADA_INICIAL:'📦'})[t]||'•'}

  function exportItems(){const rows=filteredItems().map(i=>({Codigo:i.Codigo,Nome:i.Nome,Tipo:itemTypeLabel(i.TipoItem),Categoria:i.Categoria,Unidade:i.Unidade,Saldo:i.QuantidadeAtual,EstoqueMinimo:i.EstoqueMinimo,Localizacao:i.Localizacao,Status:statusItem(i),Descricao:i.Descricao}));downloadCSV('itens_almox.csv',rows)}
  function exportLoans(){const rows=filteredLoans().map(r=>({Item:r.ItemNome,Codigo:r.CodigoItem,Tipo:itemTypeLabel(r.TipoItem),Quantidade:r.Quantidade,Devolvida:r.QuantidadeDevolvida,ResponsavelMilitar:r.RetiradoPor,Matricula:r.Matricula,Setor:r.Setor,ProcessoSEI:r.ProcessoSEI,AdjuntoRetirada:r.AdjuntoRetirada,AdjuntoDevolucao:r.AdjuntoDevolucao,DataRetirada:fmtDate(r.DataRetirada),Prevista:fmtDate(r.PrevistaDevolucao),DataDevolucao:fmtDate(r.DataDevolucao),Status:isOverdue(r)?'ATRASADA':r.Status,Finalidade:r.Finalidade,Observacoes:r.Observacoes}));downloadCSV('retiradas_almox.csv',rows)}
  function downloadCSV(name,rows){if(!rows.length){toast('Não há dados para exportar.',true);return}const keys=Object.keys(rows[0]);const safe=v=>{let x=String(v??'');if(/^[=+\-@]/.test(x))x="'"+x;return '"'+x.replace(/"/g,'""')+'"'};const csv='\ufeff'+[keys.join(';'),...rows.map(r=>keys.map(k=>safe(r[k])).join(';'))].join('\r\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}

  function fmtDate(v){if(!v)return'—';const d=new Date(v);return isNaN(d)?'—':new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(d)}
  function fmtNum(v){return new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2}).format(num(v))}
  function num(v){const n=Number(String(v??0).replace(',','.'));return Number.isFinite(n)?n:0}
  function dateMs(v){const d=new Date(v);return isNaN(d)?0:d.getTime()}
  function norm(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()}
  function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
  function attr(v){return esc(v)}
  function toLocalInput(d){const p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`}

  window.almox={ editItem:modalItem, adjust:modalAdjust, loanItem:modalLoan, returnLoan:modalReturn, editUser:modalUser, close:closeModal };
})();
