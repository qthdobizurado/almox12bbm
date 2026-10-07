(() => {
  const API = (window.ALMC_CONFIG && window.ALMC_CONFIG.API_URL || '').trim();
  const PLACEHOLDER = 'COLE_AQUI_A_URL_DO_APPS_SCRIPT_EXEC';
  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];
  const state = { token: localStorage.getItem('almox_token') || '', user:null, config:{}, itens:[], retiradas:[], movimentos:[], adjuntos:[], usuarios:[], dashboard:{}, currentView:'dashboard' };

  document.addEventListener('DOMContentLoaded', init);

  function init(){
    bindStatic();
    if (!API || API.includes(PLACEHOLDER)) $('#loginHelp').textContent = 'Antes de entrar, edite js/config.js e cole a URL /exec do Apps Script.';
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
    $('#newLoanBtn').addEventListener('click', modalLoan);
    $('#quickLoanBtn').addEventListener('click', modalLoan);
    $('#newAdjuntoBtn').addEventListener('click', () => modalAdjunto());
    $('#newUserBtn').addEventListener('click', () => modalUser());
    $('#exportItemsBtn').addEventListener('click', exportItems);
    $('#exportLoansBtn').addEventListener('click', exportLoans);
    ['itemSearch','itemCategory','itemStatus','itemLocation'].forEach(id => $('#'+id).addEventListener(id==='itemSearch'||id==='itemLocation'?'input':'change', renderItems));
    ['loanSearch','loanStatus','loanFrom','loanTo'].forEach(id => $('#'+id).addEventListener(id==='loanSearch'?'input':'change', renderLoans));
    ['moveSearch','moveType'].forEach(id => $('#'+id).addEventListener(id==='moveSearch'?'input':'change', renderMoves));
  }

  async function api(action, data={}){
    if (!API || API.includes(PLACEHOLDER)) throw new Error('Configure a URL da API em js/config.js.');
    const body = new URLSearchParams();
    body.set('payload', JSON.stringify({ action, token: state.token, ...data }));
    let res;
    try { res = await fetch(API, { method:'POST', body, redirect:'follow', credentials:'omit' }); }
    catch(e){ throw new Error('Nao foi possivel acessar a API. Confira a URL /exec e a implantacao do Apps Script.'); }
    let out;
    try { out = await res.json(); } catch(e){ throw new Error('A API retornou uma resposta invalida. Confira se a implantacao esta ativa.'); }
    if (!out.ok) throw new Error(out.error || 'Operacao nao concluida.');
    return out;
  }

  async function login(e){
    e.preventDefault();
    setLoading(true);
    try{
      const out = await api('login',{login:$('#loginUser').value,pin:$('#loginPin').value});
      state.token=out.token; state.user=out.user; localStorage.setItem('almox_token',state.token);
      $('#loginPin').value='';
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
      Object.assign(state,{user:out.user,config:out.config||{},itens:out.itens||[],retiradas:out.retiradas||[],movimentos:out.movimentos||[],adjuntos:out.adjuntos||[],usuarios:out.usuarios||[],dashboard:out.dashboard||{}});
      showApp(); renderAll();
    }catch(err){
      if (/sessao|login|usuario inativo/i.test(err.message)){ state.token=''; localStorage.removeItem('almox_token'); showLogin(); }
      throw err;
    }finally{ setLoading(false); }
  }

  function showLogin(){ $('#appView').classList.add('hidden'); $('#loginView').classList.remove('hidden'); }
  function showApp(){
    $('#loginView').classList.add('hidden'); $('#appView').classList.remove('hidden');
    $('#brandName').textContent=state.config.nomeSistema||'Almox Control'; $('#brandUnit').textContent=state.config.unidade||'Almoxarifado';
    $('#userName').textContent=state.user.Nome; $('#userRole').textContent=state.user.Perfil; $('#userInitial').textContent=(state.user.Nome||'U').trim().charAt(0).toUpperCase();
    const admin=state.user.Perfil==='ADMIN', canWrite=admin||state.user.Perfil==='ALMOX';
    $$('.admin-only').forEach(x=>x.classList.toggle('hidden',!admin));
    $$('.can-write').forEach(x=>x.classList.toggle('hidden',!canWrite));
  }

  function renderAll(){ renderDashboard(); renderCategories(); renderItems(); renderLoans(); renderMoves(); renderAdjuntos(); renderUsers(); }
  function switchView(name){
    state.currentView=name; $$('.view').forEach(v=>v.classList.remove('active-view')); $('#view-'+name)?.classList.add('active-view');
    $$('#nav [data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===name)); $('#sidebar').classList.remove('open');
  }

  function renderDashboard(){
    const d=state.dashboard||{};
    const cards=[['📦',d.totalItens||0,'Itens cadastrados',''],['↗',d.retiradasAbertas||0,'Retiradas em aberto',''],['⚠',d.estoqueBaixo||0,'Estoque baixo','alert'],['⏰',d.atrasadas||0,'Devoluções atrasadas',d.atrasadas?'danger':'']];
    $('#kpiGrid').innerHTML=cards.map(c=>`<div class="kpi ${c[3]}"><div class="kpi-icon">${c[0]}</div><strong>${fmtNum(c[1])}</strong><span>${esc(c[2])}</span></div>`).join('');
    const alerts=state.itens.filter(i=>i.Ativo!==false&&statusItem(i)!=='NORMAL').sort((a,b)=>num(a.QuantidadeAtual)-num(b.QuantidadeAtual)).slice(0,8);
    $('#stockAlerts').innerHTML=alerts.length?alerts.map(i=>`<div class="list-row"><div class="item-icon">${esc(i.Icone||'📦')}</div><div class="grow"><strong class="truncate">${esc(i.Nome)}</strong><div class="meta">${esc(i.Codigo)} • ${esc(i.Localizacao||'Sem localização')}</div></div>${badgeItem(i)}</div>`).join(''):'<div class="empty">Nenhum alerta de estoque.</div>';
    const ab=state.retiradas.filter(r=>['ABERTA','PARCIAL'].includes(r.Status)).sort((a,b)=>dateMs(a.PrevistaDevolucao||'9999')-dateMs(b.PrevistaDevolucao||'9999')).slice(0,8);
    $('#loanAlerts').innerHTML=ab.length?ab.map(r=>`<div class="list-row"><div class="item-icon">↗</div><div class="grow"><strong class="truncate">${esc(r.ItemNome)}</strong><div class="meta">${esc(r.RetiradoPor)} • ${r.PrevistaDevolucao?fmtDate(r.PrevistaDevolucao):'Sem prazo'}</div></div>${badgeLoan(r)}</div>`).join(''):'<div class="empty">Nenhuma retirada pendente.</div>';
    $('#recentActivity').innerHTML=state.movimentos.slice(0,10).map(m=>`<div class="list-row"><div class="item-icon">${moveIcon(m.Tipo)}</div><div class="grow"><strong>${esc(labelMove(m.Tipo))} · ${esc(m.ItemNome)}</strong><div class="meta">${fmtDate(m.DataHora)} • ${esc(m.Responsavel||m.UsuarioSistema||'')}</div></div><span class="number">${fmtNum(m.Quantidade)}</span></div>`).join('')||'<div class="empty">Sem movimentações ainda.</div>';
  }

  function renderCategories(){
    const sel=$('#itemCategory'), cur=sel.value; const cats=[...new Set(state.itens.map(i=>i.Categoria).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    sel.innerHTML='<option value="">Todas as categorias</option>'+cats.map(c=>`<option>${esc(c)}</option>`).join(''); sel.value=cur;
  }

  function filteredItems(){
    const q=norm($('#itemSearch').value), cat=$('#itemCategory').value, st=$('#itemStatus').value, loc=norm($('#itemLocation').value);
    return state.itens.filter(i=>(!q||norm([i.Codigo,i.Nome,i.Categoria,i.Localizacao,i.Descricao].join(' ')).includes(q))&&(!cat||i.Categoria===cat)&&(!st||statusItem(i)===st)&&(!loc||norm(i.Localizacao).includes(loc)));
  }
  function renderItems(){
    const canWrite=state.user&&['ADMIN','ALMOX'].includes(state.user.Perfil); const rows=filteredItems();
    $('#itemsBody').innerHTML=rows.length?rows.map(i=>`<tr><td><div class="item-cell"><div class="item-icon">${esc(i.Icone||'📦')}</div><div><strong>${esc(i.Nome)}</strong><div class="meta">${esc(i.Codigo)}</div></div></div></td><td>${esc(i.Categoria||'—')}</td><td class="number"><strong>${fmtNum(i.QuantidadeAtual)}</strong> ${esc(i.Unidade||'UN')}</td><td class="number">${fmtNum(i.EstoqueMinimo)}</td><td><span class="location">⌖ ${esc(i.Localizacao||'Não informada')}</span></td><td>${badgeItem(i)}</td>${canWrite?`<td><div class="row-actions"><button class="mini-btn" onclick="almox.editItem('${i.ID}')">Editar</button><button class="mini-btn primary" onclick="almox.adjust('${i.ID}')">Estoque</button><button class="mini-btn primary" onclick="almox.loanItem('${i.ID}')">Retirar</button></div></td>`:''}</tr>`).join(''):`<tr><td colspan="7" class="empty">Nenhum item encontrado.</td></tr>`;
  }

  function filteredLoans(){
    const q=norm($('#loanSearch').value), st=$('#loanStatus').value, f=$('#loanFrom').value?new Date($('#loanFrom').value+'T00:00:00').getTime():0, t=$('#loanTo').value?new Date($('#loanTo').value+'T23:59:59').getTime():Infinity;
    return state.retiradas.filter(r=>{const overdue=isOverdue(r);const matchSt=!st||(st==='ATRASADA'?overdue:r.Status===st);const ms=dateMs(r.DataRetirada);return (!q||norm([r.ItemNome,r.CodigoItem,r.RetiradoPor,r.Matricula,r.Setor,r.AdjuntoAutorizador,r.Finalidade].join(' ')).includes(q))&&matchSt&&ms>=f&&ms<=t;});
  }
  function renderLoans(){
    const canWrite=state.user&&['ADMIN','ALMOX'].includes(state.user.Perfil); const rows=filteredLoans();
    $('#loansBody').innerHTML=rows.length?rows.map(r=>{const pend=Math.max(0,num(r.Quantidade)-num(r.QuantidadeDevolvida));return `<tr class="${isOverdue(r)?'overdue-row':''}"><td><strong>${esc(r.ItemNome)}</strong><div class="meta">${esc(r.CodigoItem)}</div></td><td><strong>${esc(r.RetiradoPor)}</strong><div class="meta">${esc([r.Matricula,r.Setor].filter(Boolean).join(' • '))}</div></td><td>${esc(r.AdjuntoAutorizador)}</td><td>${fmtDate(r.DataRetirada)}</td><td>${r.PrevistaDevolucao?fmtDate(r.PrevistaDevolucao):'—'}</td><td class="number">${fmtNum(pend)} pend.</td><td>${badgeLoan(r)}</td>${canWrite?`<td>${r.Status!=='DEVOLVIDA'?`<button class="mini-btn primary" onclick="almox.returnLoan('${r.ID}')">Devolver</button>`:'—'}</td>`:''}</tr>`}).join(''):`<tr><td colspan="8" class="empty">Nenhuma retirada encontrada.</td></tr>`;
  }

  function renderMoves(){
    const q=norm($('#moveSearch').value), t=$('#moveType').value;
    const rows=state.movimentos.filter(m=>(!q||norm([m.CodigoItem,m.ItemNome,m.Responsavel,m.Observacao,m.UsuarioSistema].join(' ')).includes(q))&&(!t||m.Tipo===t));
    $('#movesBody').innerHTML=rows.length?rows.map(m=>`<tr><td>${fmtDate(m.DataHora)}</td><td><span class="badge ${m.Tipo==='RETIRADA'?'open':m.Tipo==='DEVOLUCAO'?'':'off'}">${esc(labelMove(m.Tipo))}</span></td><td><strong>${esc(m.ItemNome)}</strong><div class="meta">${esc(m.CodigoItem)}</div></td><td class="number">${fmtNum(m.Quantidade)}</td><td class="number">${fmtNum(m.SaldoAntes)} → ${fmtNum(m.SaldoDepois)}</td><td>${esc(m.Responsavel||'—')}</td><td>${esc(m.UsuarioSistema||'—')}</td><td>${esc(m.Observacao||'—')}</td></tr>`).join(''):`<tr><td colspan="8" class="empty">Nenhuma movimentação encontrada.</td></tr>`;
  }

  function renderAdjuntos(){
    const canWrite=state.user&&['ADMIN','ALMOX'].includes(state.user.Perfil);
    $('#adjuntosBody').innerHTML=state.adjuntos.length?state.adjuntos.map(a=>`<tr><td><strong>${esc(a.Nome)}</strong></td><td>${esc(a.CargoFuncao||'—')}</td><td><span class="badge">Ativo</span></td><td>${esc(a.Observacoes||'—')}</td>${canWrite?`<td><button class="mini-btn" onclick="almox.editAdjunto('${a.ID}')">Editar</button></td>`:''}</tr>`).join(''):`<tr><td colspan="5" class="empty">Cadastre os adjuntos que podem autorizar retiradas.</td></tr>`;
  }

  function renderUsers(){
    if(!state.user||state.user.Perfil!=='ADMIN') return;
    $('#usersBody').innerHTML=state.usuarios.length?state.usuarios.map(u=>`<tr><td><strong>${esc(u.Nome)}</strong></td><td>${esc(u.Login)}</td><td><span class="badge open">${esc(u.Perfil)}</span></td><td>${u.Ativo?'<span class="badge">Ativo</span>':'<span class="badge off">Inativo</span>'}</td><td>${u.AtualizadoEm?fmtDate(u.AtualizadoEm):'—'}</td><td><button class="mini-btn" onclick="almox.editUser('${u.ID}')">Editar</button></td></tr>`).join(''):`<tr><td colspan="6" class="empty">Nenhum usuário.</td></tr>`;
  }

  function modalItem(id){
    const i=id?state.itens.find(x=>x.ID===id):null;
    openModal(i?'Editar item':'Novo item',`<form id="itemForm" class="form-grid">
      <label>Nome*<input name="nome" required value="${attr(i?.Nome||'')}"></label><label>Código<input name="codigo" value="${attr(i?.Codigo||'')}" placeholder="Automático se vazio" ${i?'':' '}></label>
      <label>Categoria<input name="categoria" value="${attr(i?.Categoria||'')}"></label><label>Unidade<select name="unidade">${['UN','PC','CX','JG','PAR','M','KG','L'].map(x=>`<option ${x===(i?.Unidade||'UN')?'selected':''}>${x}</option>`).join('')}</select></label>
      ${i?'':`<label>Saldo inicial<input name="quantidadeAtual" type="number" min="0" step="0.01" value="0"><span class="hint">Depois do cadastro, altere saldo por “Estoque”.</span></label>`}<label>Estoque mínimo<input name="estoqueMinimo" type="number" min="0" step="0.01" value="${attr(i?.EstoqueMinimo??0)}"></label>
      <label class="full">Localização no almoxarifado*<input name="localizacao" required value="${attr(i?.Localizacao||'')}" placeholder="Ex.: Corredor A > Prateleira 2 > Caixa 3"></label>
      <label>Ícone<input name="icone" value="${attr(i?.Icone||'📦')}" maxlength="12" placeholder="📦"></label><label>Status<select name="ativo"><option value="true" ${i?.Ativo!==false?'selected':''}>Ativo</option><option value="false" ${i?.Ativo===false?'selected':''}>Inativo</option></select></label>
      <label class="full">Descrição<textarea name="descricao">${esc(i?.Descricao||'')}</textarea></label><div class="form-actions"><button type="button" class="btn secondary" onclick="almox.close()">Cancelar</button><button class="btn primary">Salvar</button></div></form>`);
    $('#itemForm').addEventListener('submit',async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));f.ID=id||'';f.ativo=f.ativo==='true';f.quantidadeAtual=num(f.quantidadeAtual);f.estoqueMinimo=num(f.estoqueMinimo);await mutate('saveItem',{item:f});});
  }

  function modalAdjust(id){
    const i=state.itens.find(x=>x.ID===id); if(!i)return;
    openModal('Ajustar estoque',`<div class="section-note">${esc(i.Nome)} • saldo atual: <strong>${fmtNum(i.QuantidadeAtual)} ${esc(i.Unidade||'UN')}</strong></div><form id="adjustForm" class="form-grid"><label>Tipo<select name="tipo"><option value="ENTRADA">Entrada / reposição</option><option value="SAIDA_AJUSTE">Saída por ajuste</option><option value="DEFINIR_SALDO">Definir saldo exato</option></select></label><label>Quantidade / novo saldo<input name="valor" type="number" min="0" step="0.01" required></label><label class="full">Motivo*<textarea name="motivo" required placeholder="Ex.: conferência física, recebimento, perda, correção..."></textarea></label><div class="form-actions"><button type="button" class="btn secondary" onclick="almox.close()">Cancelar</button><button class="btn primary">Confirmar</button></div></form>`);
    $('#adjustForm').addEventListener('submit',async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));await mutate('adjustStock',{itemId:id,tipo:f.tipo,valor:num(f.valor),motivo:f.motivo});});
  }

  function modalLoan(preselect){
    if(!state.itens.length){toast('Cadastre um item primeiro.',true);return}
    if(!state.adjuntos.some(a=>a.Ativo!==false&&String(a.Ativo).toLowerCase()!=='false')){toast('Cadastre pelo menos um adjunto autorizador ativo primeiro.',true);switchView('adjuntos');return}
    const now=toLocalInput(new Date());
    openModal('Registrar retirada',`<form id="loanForm" class="form-grid"><label class="full">Item*<select name="itemId" required><option value="">Selecione...</option>${state.itens.filter(i=>i.Ativo!==false&&String(i.Ativo).toLowerCase()!=='false'&&num(i.QuantidadeAtual)>0).map(i=>`<option value="${i.ID}" ${preselect===i.ID?'selected':''}>${esc(i.Codigo)} — ${esc(i.Nome)} (saldo ${fmtNum(i.QuantidadeAtual)})</option>`).join('')}</select></label><label>Quantidade*<input name="quantidade" type="number" min="0.01" step="0.01" required></label><label>Data da retirada*<input name="dataRetirada" type="datetime-local" value="${now}" required></label><label>Retirado por*<input name="retiradoPor" required></label><label>Matrícula / identificação<input name="matricula"></label><label>Setor<input name="setor"></label><label>Adjunto autorizador*<select name="adjunto" required><option value="">Selecione...</option>${state.adjuntos.filter(a=>a.Ativo!==false&&String(a.Ativo).toLowerCase()!=='false').map(a=>`<option>${esc(a.Nome)}</option>`).join('')}</select></label><label>Devolução prevista<input name="prevista" type="datetime-local"></label><label class="full">Finalidade<input name="finalidade" placeholder="Motivo da retirada"></label><label class="full">Observações<textarea name="observacoes"></textarea></label><div class="form-actions"><button type="button" class="btn secondary" onclick="almox.close()">Cancelar</button><button class="btn primary">Registrar retirada</button></div></form>`);
    $('#loanForm').addEventListener('submit',async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));const loan={itemId:f.itemId,quantidade:num(f.quantidade),retiradoPor:f.retiradoPor,matricula:f.matricula,setor:f.setor,adjunto:f.adjunto,finalidade:f.finalidade,observacoes:f.observacoes,dataRetiradaMs:new Date(f.dataRetirada).getTime(),previstaDevolucaoMs:f.prevista?new Date(f.prevista).getTime():null};await mutate('registerLoan',{loan});});
  }

  function modalReturn(id){
    const r=state.retiradas.find(x=>x.ID===id);if(!r)return;const p=Math.max(0,num(r.Quantidade)-num(r.QuantidadeDevolvida));
    openModal('Registrar devolução',`<div class="section-note">${esc(r.ItemNome)} • retirado por ${esc(r.RetiradoPor)} • pendente: <strong>${fmtNum(p)}</strong></div><form id="returnForm" class="form-grid"><label>Quantidade devolvida*<input name="quantidade" type="number" min="0.01" max="${p}" step="0.01" value="${p}" required></label><label class="full">Observações<textarea name="observacoes" placeholder="Estado do item, avaria, observações..."></textarea></label><div class="form-actions"><button type="button" class="btn secondary" onclick="almox.close()">Cancelar</button><button class="btn primary">Confirmar devolução</button></div></form>`);
    $('#returnForm').addEventListener('submit',async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));await mutate('registerReturn',{retiradaId:id,quantidade:num(f.quantidade),observacoes:f.observacoes});});
  }

  function modalAdjunto(id){
    const a=id?state.adjuntos.find(x=>x.ID===id):null;
    openModal(a?'Editar adjunto':'Novo adjunto',`<form id="adjForm" class="form-grid"><label>Nome*<input name="nome" required value="${attr(a?.Nome||'')}"></label><label>Cargo/Função<input name="cargoFuncao" value="${attr(a?.CargoFuncao||'')}"></label><label>Status<select name="ativo"><option value="true" selected>Ativo</option><option value="false">Inativo</option></select></label><label class="full">Observações<textarea name="observacoes">${esc(a?.Observacoes||'')}</textarea></label><div class="form-actions"><button type="button" class="btn secondary" onclick="almox.close()">Cancelar</button><button class="btn primary">Salvar</button></div></form>`);
    if(a) $('#adjForm [name=ativo]').value=String(a.Ativo!==false);
    $('#adjForm').addEventListener('submit',async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));f.ID=id||'';f.ativo=f.ativo==='true';await mutate('saveAdjunto',{adjunto:f});});
  }

  function modalUser(id){
    const u=id?state.usuarios.find(x=>x.ID===id):null;
    openModal(u?'Editar usuário':'Novo usuário',`<form id="userForm" class="form-grid"><label>Nome*<input name="nome" required value="${attr(u?.Nome||'')}"></label><label>Login*<input name="login" required value="${attr(u?.Login||'')}"></label><label>Perfil<select name="perfil">${['ADMIN','ALMOX','CONSULTA'].map(p=>`<option ${p===(u?.Perfil||'CONSULTA')?'selected':''}>${p}</option>`).join('')}</select></label><label>Status<select name="ativo"><option value="true">Ativo</option><option value="false">Inativo</option></select></label><label class="full">${u?'Novo PIN (deixe vazio para manter)':'PIN*'}<input name="pin" type="password" inputmode="numeric" ${u?'':'required'}><span class="hint">De 4 a 10 dígitos numéricos.</span></label><div class="form-actions"><button type="button" class="btn secondary" onclick="almox.close()">Cancelar</button><button class="btn primary">Salvar</button></div></form>`);
    if(u) $('#userForm [name=ativo]').value=String(u.Ativo!==false);
    $('#userForm').addEventListener('submit',async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));f.ID=id||'';f.ativo=f.ativo==='true';await mutate('saveUser',{user:f});});
  }

  function modalChangePin(){
    openModal('Alterar meu PIN',`<form id="pinForm" class="form-grid"><label>PIN atual<input name="pinAtual" type="password" inputmode="numeric" required></label><label>Novo PIN<input name="novoPin" type="password" inputmode="numeric" required></label><label class="full">Confirmar novo PIN<input name="confirmar" type="password" inputmode="numeric" required></label><div class="form-actions"><button type="button" class="btn secondary" onclick="almox.close()">Cancelar</button><button class="btn primary">Alterar PIN</button></div></form>`);
    $('#pinForm').addEventListener('submit',async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));if(f.novoPin!==f.confirmar){toast('A confirmação do novo PIN não confere.',true);return}await mutate('changePin',{pinAtual:f.pinAtual,novoPin:f.novoPin},false);closeModal();toast('PIN alterado com sucesso.');});
  }

  async function mutate(action,data,doRefresh=true){
    setLoading(true);try{const out=await api(action,data);closeModal();toast(out.message||'Concluído.');if(doRefresh)await refresh();}catch(err){toast(err.message,true);}finally{setLoading(false)}
  }

  function openModal(title,html){$('#modalTitle').textContent=title;$('#modalContent').innerHTML=html;$('#modal').classList.remove('hidden')}
  function closeModal(){$('#modal').classList.add('hidden');$('#modalContent').innerHTML=''}
  function toast(msg,error=false){const t=$('#toast');t.textContent=msg;t.classList.toggle('error',error);t.classList.remove('hidden');clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.add('hidden'),4200)}
  function setLoading(on){$('#loading').classList.toggle('hidden',!on)}

  function statusItem(i){if(i.Ativo===false||String(i.Ativo).toLowerCase()==='false')return'INATIVO';const q=num(i.QuantidadeAtual),m=num(i.EstoqueMinimo);return q<=0?'ZERADO':q<=m?'BAIXO':'NORMAL'}
  function badgeItem(i){const s=statusItem(i);return s==='INATIVO'?'<span class="badge off">Inativo</span>':s==='ZERADO'?'<span class="badge zero">Zerado</span>':s==='BAIXO'?'<span class="badge low">Baixo</span>':'<span class="badge">Normal</span>'}
  function isOverdue(r){return ['ABERTA','PARCIAL'].includes(r.Status)&&r.PrevistaDevolucao&&dateMs(r.PrevistaDevolucao)<Date.now()}
  function badgeLoan(r){if(r.Status==='DEVOLVIDA')return'<span class="badge">Devolvida</span>';if(isOverdue(r))return'<span class="badge overdue">Atrasada</span>';if(r.Status==='PARCIAL')return'<span class="badge partial">Parcial</span>';return'<span class="badge open">Aberta</span>'}
  function labelMove(t){return({RETIRADA:'Retirada',DEVOLUCAO:'Devolução',ENTRADA:'Entrada',AJUSTE:'Ajuste',ENTRADA_INICIAL:'Entrada inicial'})[t]||t}
  function moveIcon(t){return({RETIRADA:'↗',DEVOLUCAO:'↙',ENTRADA:'＋',AJUSTE:'⚙',ENTRADA_INICIAL:'📦'})[t]||'•'}

  function exportItems(){const rows=filteredItems().map(i=>({Codigo:i.Codigo,Nome:i.Nome,Categoria:i.Categoria,Unidade:i.Unidade,Saldo:i.QuantidadeAtual,EstoqueMinimo:i.EstoqueMinimo,Localizacao:i.Localizacao,Status:statusItem(i),Descricao:i.Descricao}));downloadCSV('itens_almox.csv',rows)}
  function exportLoans(){const rows=filteredLoans().map(r=>({Item:r.ItemNome,Codigo:r.CodigoItem,Quantidade:r.Quantidade,Devolvida:r.QuantidadeDevolvida,RetiradoPor:r.RetiradoPor,Matricula:r.Matricula,Setor:r.Setor,Adjunto:r.AdjuntoAutorizador,DataRetirada:fmtDate(r.DataRetirada),Prevista:fmtDate(r.PrevistaDevolucao),DataDevolucao:fmtDate(r.DataDevolucao),Status:isOverdue(r)?'ATRASADA':r.Status,Finalidade:r.Finalidade,Observacoes:r.Observacoes}));downloadCSV('retiradas_almox.csv',rows)}
  function downloadCSV(name,rows){if(!rows.length){toast('Não há dados para exportar.',true);return}const keys=Object.keys(rows[0]);const safe=v=>{let x=String(v??'');if(/^[=+\-@]/.test(x))x="'"+x;return '"'+x.replace(/"/g,'""')+'"'};const csv='\ufeff'+[keys.join(';'),...rows.map(r=>keys.map(k=>safe(r[k])).join(';'))].join('\r\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}

  function fmtDate(v){if(!v)return'—';const d=new Date(v);return isNaN(d)?'—':new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(d)}
  function fmtNum(v){return new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2}).format(num(v))}
  function num(v){const n=Number(String(v??0).replace(',','.'));return Number.isFinite(n)?n:0}
  function dateMs(v){const d=new Date(v);return isNaN(d)?0:d.getTime()}
  function norm(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()}
  function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
  function attr(v){return esc(v)}
  function toLocalInput(d){const p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`}

  window.almox={ editItem:modalItem, adjust:modalAdjust, loanItem:modalLoan, returnLoan:modalReturn, editAdjunto:modalAdjunto, editUser:modalUser, close:closeModal };
})();
