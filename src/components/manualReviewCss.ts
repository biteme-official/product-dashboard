/** 메뉴얼 › 그림 · 연습 화면 스타일 (.pman 아래로 스코프) */
export const MANUAL_REVIEW_CSS = `
.pman small { font-size: 11px; color: var(--muted); font-weight: 500; }
.pman :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.pman .chip.on { background: var(--text); color: var(--bg); }
.pman .chip.c-blue { background: #dbeafe; color: #1d4ed8; }
.pman .chip.c-green { background: var(--ok-soft); color: #047857; }
.pman .chip.c-amber { background: #fef3c7; color: #92400e; }
.pman .chip.c-red { background: #fee2e2; color: #b91c1c; }
.pman .rv-grow { flex: 1 1 auto; }
.pman .rv-shot { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 9px; min-width: 660px; position: relative; font-size: 12px; }
.pman .rv-shot-wrap { overflow-x: auto; }
.pman .rv-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.pman .rv-bar .chip { font-size: 11px; padding: 2px 9px; border: 1px solid var(--border); background: var(--surface); color: var(--muted); }
.pman .rv-bar .chip.on { background: var(--text); color: var(--bg); border-color: var(--text); }
.pman .rv-div { width: 1px; height: 16px; background: var(--border); margin: 0 3px; }
.pman .rv-pin { flex: 0 0 auto; width: 18px; height: 18px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 10.5px; font-weight: 800; background: var(--danger); color: #fff; font-family: var(--mono); }
.pman .rv-status { display: flex; align-items: center; gap: 7px; background: #fffbeb; border: 1px solid #fde68a; color: #92400e; border-radius: 8px; padding: 6px 10px; }
.pman .rv-mini-btn { border: 1px solid currentColor; border-radius: 5px; padding: 0 7px; font-size: 11px; }
.pman .rv-summary { display: grid; grid-template-columns: repeat(9, 1fr); gap: 4px; border: 1px solid var(--border); border-radius: 8px; padding: 7px 10px 7px 30px; position: relative; }
.pman .rv-summary div { display: flex; flex-direction: column; min-width: 0; }
.pman .rv-summary b { font-variant-numeric: tabular-nums; font-size: 12.5px; white-space: nowrap; }
.pman .rv-summary small { font-size: 10px; white-space: nowrap; }
.pman .rv-pin-abs { position: absolute; left: 7px; top: 50%; transform: translateY(-50%); }
.pman .rv-rows { position: relative; display: flex; flex-direction: column; padding-left: 26px; }
.pman .rv-pin-row { position: absolute; left: 0; top: 50%; transform: translateY(-50%); }
.pman .rv-row, .pman .rv-simrow { display: grid; grid-template-columns: minmax(150px, 1.5fr) 112px 112px 46px minmax(150px, 1.2fr); gap: 7px; align-items: center; padding: 7px 0; border-top: 1px solid var(--border); }
.pman .rv-simrow { grid-template-columns: minmax(150px, 1.4fr) 124px 124px minmax(170px, 1.4fr); background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 9px 12px; }
.pman .rv-row > div:first-child, .pman .rv-simname { display: flex; flex-direction: column; min-width: 0; }
.pman .rv-plan { display: flex; flex-direction: column; border: 1px solid var(--border); background: var(--surface); color: var(--text); border-radius: 7px; padding: 4px 8px; font-size: 11.5px; text-align: left; line-height: 1.35; font-variant-numeric: tabular-nums; }
.pman .rv-plan small { font-size: 10.5px; color: inherit; opacity: .8; }
.pman .rv-plan.on { background: var(--accent); border-color: var(--accent); color: #fff; }
.pman .rv-plan.dash { border-style: dashed; color: var(--muted); }
.pman .rv-plan b { font-weight: 700; }
.pman .rv-cell { display: flex; flex-direction: column; text-align: right; }
.pman .rv-tags { display: flex; flex-wrap: wrap; gap: 4px; }
.pman .rv-tags .chip { font-size: 11px; padding: 2px 8px; }
.pman .rv-missions { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 8px; }
.pman .rv-m { background: var(--sunken); border-radius: 10px; padding: 8px 11px; font-size: 12.5px; display: flex; gap: 7px; }
.pman .rv-m.done { background: var(--ok-soft); }
.pman .rv-m small { display: block; font-size: 11.5px; }
.pman .rv-sim { display: flex; flex-direction: column; gap: 10px; }
.pman .rv-sim-top { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.pman .rv-check { display: inline-flex; align-items: center; gap: 5px; font-size: 12.5px; font-weight: 600; }
.pman .rv-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(92px, 1fr)); gap: 6px; }
.pman .rv-metrics div { background: var(--surface); border-radius: 9px; padding: 7px 10px; display: flex; flex-direction: column; min-width: 0; }
.pman .rv-metrics b { font-size: 15px; font-weight: 800; font-variant-numeric: tabular-nums; transition: color .3s; white-space: nowrap; }
.pman .rv-box { background: var(--surface); border-radius: 10px; padding: 11px 13px; display: flex; flex-direction: column; gap: 9px; min-width: 0; }
.pman .rv-box-t { font-size: 13px; font-weight: 800; }
.pman .rv-ctrls { display: flex; flex-wrap: wrap; gap: 9px 16px; }
.pman .rv-ctrls label { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--muted); font-weight: 600; flex-wrap: wrap; }
.pman .rv-ctrls input, .pman .rv-ctrls select { font-size: 13px; padding: 4px 7px; border: 1px solid var(--border); border-radius: 7px; background: var(--surface); color: var(--text); font-variant-numeric: tabular-nums; max-width: 100%; }
.pman .rv-ctrls input { width: 84px; text-align: right; }
.pman .rv-ctrls select:not(:disabled):hover, .pman .rv-ctrls input:not(:disabled):hover { border-color: var(--accent); }
.pman .rv-plain { border: none; border-radius: 0; }
.pman .rv-plantbl th, .pman .rv-plantbl td { padding: 5px 5px; text-align: right; font-variant-numeric: tabular-nums; }
.pman .rv-plantbl th:first-child, .pman .rv-plantbl td:first-child { text-align: left; white-space: nowrap; font-weight: 700; }
.pman .rv-plantbl input { width: 54px; font-size: 12.5px; padding: 3px 4px; text-align: right; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); color: var(--text); font-variant-numeric: tabular-nums; }
.pman .rv-plantbl td.over { color: var(--danger); font-weight: 700; }
.pman .rv-cover { background: var(--sunken); border-radius: 8px; padding: 8px 8px 0; height: 180px; }
.pman .rv-sim-foot { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; }
.pman .rv-confirm { border: none; border-radius: 8px; padding: 6px 14px; font-size: 12.5px; font-weight: 700; background: var(--accent); color: #fff; }
.pman .rv-confirm.off { background: var(--surface); color: var(--text); border: 1px solid var(--border); }
.pman .matrix small { font-size: 10.5px; white-space: nowrap; }
.pman .rv-col { height: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; gap: 4px; min-width: 0; }
.pman .rv-plot { position: relative; flex: 1 1 auto; width: 100%; display: flex; align-items: flex-end; justify-content: center; }
.pman .rv-barv { width: min(44px, 70%); background: var(--accent); border-radius: 5px 5px 2px 2px; position: relative; }
.pman .rv-barv span { position: absolute; top: -17px; left: 50%; transform: translateX(-50%); font-size: 10.5px; font-weight: 700; color: var(--muted); white-space: nowrap; }
.pman .rv-tgt { position: absolute; left: 8%; right: 8%; border-top: 2px dashed var(--text); }
.pman .rv-lg-t { width: 16px !important; height: 0 !important; border-top: 2px dashed var(--text); border-radius: 0 !important; }
.pman .rv-err { background: #fef2f2; } .pman .rv-warn { background: #fffbeb; }
.pman .rv-mlab { font-size: 11px; color: var(--faint); }
@media (max-width: 640px) { .pman .rv-simrow { grid-template-columns: 1fr 1fr; } .pman .rv-simname, .pman .rv-simrow .rv-tags { grid-column: 1 / -1; } }
.pman .rc-top{display:grid;grid-template-columns:110px minmax(0,1fr) 190px;gap:12px}
.pman .rc-thumb,.pman .rc-basic,.pman .rc-side{display:flex;flex-direction:column;gap:6px;min-width:0}
.pman .rc-img{aspect-ratio:1;background:var(--accent-soft);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:30px}
.pman .rc-link{font-size:10.5px;font-weight:700;color:var(--accent);background:var(--accent-soft);border-radius:6px;padding:4px 6px}
.pman .rc-h{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.pman .rc-h .chip{font-size:10.5px;padding:1px 7px}
.pman .rc-fields{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px}
.pman .rc-fields.two{grid-template-columns:1fr 1fr}
.pman .rc-fields span,.pman .rc-colors span{font-size:10.5px;color:var(--muted);border:1px solid var(--border);border-radius:5px;padding:4px 5px;white-space:nowrap;overflow:hidden}
.pman .rc-fields .w2{grid-column:span 2}
.pman .rc-colors{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px}
.pman .rc-memo{height:30px;border:1px solid var(--border);border-radius:6px}
.pman .rc-result{border:2px solid #c7d2fe;border-radius:8px;padding:9px;display:flex;flex-direction:column;gap:8px}
.pman .rc-go{font-size:10.5px;font-weight:700;background:var(--accent);color:#fff;border-radius:5px;padding:3px 8px;white-space:nowrap}
.pman .rc-go.light{background:var(--surface);color:var(--text);border:1px solid var(--border)}
.pman .rc-two{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.15fr);gap:12px}
.pman .rc-kpi{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.pman .rc-kpi div{display:flex;flex-direction:column}
.pman .rc-t{font-size:10.5px;margin-top:3px}
.pman .rc-t th,.pman .rc-t td{padding:2px 6px;text-align:right;font-size:10.5px}
.pman .rc-t th:first-child,.pman .rc-t td:first-child{text-align:left}
.pman .rs-sum{display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px;border:1px solid var(--border);border-radius:8px;padding:6px 9px}
.pman .rs-sum>div{display:flex;flex-direction:column}
.pman .rs-sum .chip{font-size:10.5px;padding:1px 8px}
.pman .rs-main{display:grid;grid-template-columns:120px minmax(0,1fr);gap:9px}
.pman .rs-list{display:flex;flex-direction:column;gap:4px;border:1px solid var(--border);border-radius:8px;padding:7px}
.pman .rs-it{font-size:11.5px;font-weight:700;border-radius:6px;padding:4px 6px;display:flex;flex-direction:column}
.pman .rs-it.on{background:var(--accent-soft)}
.pman .rs-right{display:flex;flex-direction:column;gap:7px;min-width:0}
.pman .rs-plans{display:grid;grid-template-columns:1fr 1fr;gap:7px;position:relative}
.pman .rs-plan{border:1px solid var(--border);border-radius:8px;padding:7px 9px;display:flex;flex-direction:column;gap:3px;align-items:flex-start;font-size:11.5px}
.pman .rs-plan.on{border:2px solid var(--accent)}
.pman .rs-plan.dash{border-style:dashed;align-items:center;justify-content:center;background:var(--sunken)}
.pman .rs-plan .chip{font-size:10.5px;padding:1px 7px}
.pman .rs-strip,.pman .s-strip{display:grid;grid-template-columns:repeat(8,1fr);gap:2px;width:100%}
.pman .rs-strip i{height:9px;border-radius:2px;display:block}
.pman i.g,.pman .s-strip .g{background:#d1fae5;color:#065f46}.pman i.d,.pman .s-strip .d{background:#047857;color:#fff}.pman i.o,.pman .s-strip .o{background:repeating-linear-gradient(135deg,rgba(234,88,12,.35) 0 1px,transparent 1px 5px);color:#9a3412}
.pman .rs-mid{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:7px}
.pman .rs-box{border:1px solid var(--border);border-radius:8px;padding:7px 9px;display:flex;flex-direction:column;position:relative;font-size:11.5px}
.pman .rv-pin.abs{position:absolute;top:-6px;right:-5px;z-index:1}
.pman .rs-foot{display:flex;flex-wrap:wrap;align-items:center;gap:6px;border:1px solid var(--faint);border-radius:8px;padding:5px 8px}
.pman .rs-foot .chip{font-size:10.5px;padding:1px 7px}
/* 시뮬레이터 */
.pman .s-head{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center}
.pman .s-plans{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:9px}
.pman .s-plan{background:var(--surface);border:2px solid var(--border);border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:7px;min-width:0}
.pman .s-plan.on{border-color:var(--accent);box-shadow:0 0 0 3px #eef2ff}
.pman .s-plan.empty{border-style:dashed;background:var(--sunken);align-items:center;justify-content:center;text-align:center;min-height:170px}
.pman .s-row{display:flex;flex-wrap:wrap;align-items:center;gap:5px}
.pman .s-row .chip{font-size:11px;padding:1px 8px}
.pman .s-q{display:flex;flex-wrap:wrap;align-items:center;gap:6px;font-size:12px;color:var(--muted)}
.pman .s-q b{font-size:18px;color:var(--text);font-variant-numeric:tabular-nums}
.pman .s-q b.sm{font-size:13.5px}
.pman input.s-in{font:inherit;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);text-align:right;font-variant-numeric:tabular-nums;padding:3px 5px;width:62px}
.pman input.s-in.big{width:92px;font-size:17px;font-weight:800}
.pman input.s-in:hover:not(:disabled){border-color:var(--accent)}
.pman input.s-in:disabled{background:var(--sunken);color:var(--muted)}
.pman .s-note{font-size:11.5px;background:var(--accent-soft);border-radius:6px;padding:2px 8px}
.pman .s-note b{color:var(--accent)}
.pman .s-strip span{font-size:10px;font-weight:700;text-align:center;border-radius:3px;padding:2px 0}
.pman .s-money{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px 10px;font-variant-numeric:tabular-nums}
.pman .s-money div{display:flex;flex-direction:column;min-width:0}
.pman .s-money b{font-size:14px;font-weight:800;white-space:nowrap}
.pman .s-money .x b{font-size:12px;font-weight:700}
.pman .s-delta{align-self:flex-start;font-size:11.5px;font-weight:700;color:var(--accent);background:var(--accent-soft);border-radius:6px;padding:2px 8px}
.pman .s-btn{border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:12px;font-weight:600;border-radius:6px;padding:3px 10px}
.pman .s-btn:hover:not(:disabled){border-color:var(--accent);color:var(--accent)}
.pman .s-btn.pri{background:var(--accent);border-color:var(--accent);color:#fff}
.pman .s-btn.pri:hover:not(:disabled){color:#fff}
.pman .s-btn:disabled{opacity:.45}
.pman .s-tabs{display:flex;gap:2px;border-bottom:1px solid var(--border);overflow-x:auto}
.pman .s-tabs button{border:0;border-bottom:2px solid transparent;background:none;color:var(--muted);font-size:12px;font-weight:700;padding:5px 10px;white-space:nowrap}
.pman .s-tabs button[aria-selected="true"]{border-color:var(--accent);color:var(--accent)}
.pman .s-t th,.pman .s-t td{padding:4px 5px;text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.pman .s-t th:first-child,.pman .s-t td:first-child{text-align:left}
.pman .s-t td.over{color:#c2410c;font-weight:700}
.pman .s-bars{display:flex;align-items:flex-end;justify-content:flex-end;gap:2px;height:44px}
.pman .s-bars i{display:block;width:9px;border-radius:2px 2px 0 0}
.pman .s-opt{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
.pman .s-warn{color:#dc2626;font-weight:700;font-size:11.5px}
.pman .s-chips{display:flex;flex-wrap:wrap;gap:4px;align-items:center}
.pman .s-chips button{border:1px solid var(--border);background:var(--surface);color:var(--text);border-radius:99px;font-size:11.5px;padding:2px 10px;font-variant-numeric:tabular-nums}
.pman .s-chips button[aria-pressed="true"]{background:var(--text);color:var(--bg);font-weight:700}
.pman .s-chips button:disabled{opacity:.5}
.pman .s-foot{position:sticky;bottom:6px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;background:var(--surface);border:1px solid var(--faint);border-radius:9px;padding:7px 11px;box-shadow:var(--shadow)}
.pman .s-foot .chip{font-size:11px;padding:1px 8px}
.pman .s-mirror{background:var(--surface);border:2px solid #c7d2fe;border-radius:9px;padding:9px 12px;display:flex;flex-wrap:wrap;gap:6px 18px;align-items:center;font-variant-numeric:tabular-nums}
.pman .s-mirror div{display:flex;flex-direction:column}
.pman .s-log{min-height:19px;color:var(--accent);font-weight:700}
.pman .rv-m .ck{flex:0 0 auto}
@media (max-width:640px){.pman .rc-top{grid-template-columns:90px minmax(0,1fr)}.pman .rc-side{grid-column:1/-1}}

.pman .body{max-width:1200px}
.pman .rv-split{display:grid;grid-template-columns:minmax(0,1.75fr) minmax(250px,1fr);gap:18px;align-items:start}
.pman .rv-split>*{min-width:0}
.pman .rv-split .rv-shot{min-width:620px}
.pman .rv-lg{display:flex;flex-direction:column;gap:3px}
.pman .rv-lg-h{font-weight:800;color:var(--muted);padding:6px 0 2px;font-size:11.5px}
.pman .rv-li{display:flex;gap:8px;align-items:flex-start;padding:5px 0;border-top:1px solid var(--border)}
.pman .rv-lg-h+.rv-li,.pman .rv-lg>.rv-li:first-child{border-top:0}
.pman .rv-li>div{display:flex;flex-direction:column;min-width:0}
.pman .rv-li b{font-size:13px;line-height:1.35}
.pman .rv-li span:not(.rv-pin){font-size:12px;color:var(--muted);line-height:1.4}
.pman .rv-pair{display:grid;grid-template-columns:repeat(auto-fit,minmax(380px,1fr));gap:16px;align-items:stretch}
.pman .rv-pair>*{min-width:0}
.pman .steps.flow{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:8px}
.pman .steps.flow .step{border:0;background:var(--sunken);border-radius:10px;padding:10px 12px;gap:9px}
.pman .steps.flow .step h5{font-size:13px}.pman .steps.flow .step p{font-size:12px}
@media (max-width:1040px){.pman .rv-split{grid-template-columns:minmax(0,1fr)}}
.pman .hero-inner,.pman .nav-inner{max-width:1200px}

/* 발주량 검토 › 필터 드롭다운 · 검토 요청 그림 */
.pman .rq-dd{font-size:11px;border:1px solid var(--border);border-radius:6px;padding:1px 8px;background:var(--surface);color:var(--muted);white-space:nowrap}
.pman .rq-dd.teal{border-color:#14b8a6;background:#ccfbf1;color:#0f766e;font-weight:700}
.pman .rq-ck{flex-direction:row;gap:5px;align-items:flex-start}
.pman .rq-ck i{font-style:normal;color:#0f766e;line-height:1.3}
.pman .rq-ck span{display:flex;flex-direction:column}
.pman .rq-pick{font-size:10.5px;font-weight:700;color:#0f766e;background:#ccfbf1;border-radius:6px;padding:4px 6px;text-align:center}
.pman .rq-btn{font-size:10.5px;font-weight:700;border-radius:5px;padding:1px 7px;white-space:nowrap;border:1px solid}
.pman .rq-btn.pl{border-color:#34d399;color:#047857;background:#ecfdf5}.pman .rq-btn.pl.on{background:#059669;border-color:#059669;color:#fff}
.pman .rq-btn.br{border-color:#fbbf24;color:#b45309;background:#fffbeb}.pman .rq-btn.br.on{background:#f59e0b;border-color:#f59e0b;color:#fff}
.pman .rq-btn.gl{border-color:#38bdf8;color:#0369a1;background:#f0f9ff}
.pman .rq-banner{border:1px solid #5eead4;background:#f0fdfa;border-radius:8px;padding:7px 9px;display:flex;flex-direction:column;gap:5px}
.pman .rq-badge{font-size:10.5px;font-weight:700;background:#0d9488;color:#fff;border-radius:999px;padding:1px 8px;white-space:nowrap}
.pman .rq-memo{font-size:11px;background:var(--surface);border-radius:5px;padding:3px 7px}
.pman .rq-del{color:#b91c1c;border-color:#fca5a5}
.pman .rq-bar{width:56px;height:6px;border-radius:3px;background:var(--surface);border:1px solid var(--border);overflow:hidden;display:inline-block}
.pman .rq-bar i{display:block;height:100%;background:#10b981}
.pman .rq-sumtbl{gap:5px;border-color:#5eead4}
.pman .rq-sumtbl .chip{font-size:10.5px;padding:1px 8px}
.pman .rq-ord{flex-direction:row;justify-content:space-between;align-items:center;gap:4px}
.pman .rq-ord i{font-style:normal;font-family:var(--mono);color:#0f766e;margin-right:4px}
.pman .rq-gc{display:inline-flex;gap:2px}
.pman .rq-gc em{font-style:normal;font-size:9.5px;border:1px solid var(--border);border-radius:3px;padding:0 3px;color:var(--muted)}
.pman .rq-gc em.ok{background:var(--ok-soft);color:#047857;border-color:transparent}
.pman .rs-main.rq-main{grid-template-columns:168px minmax(0,1fr)}
.pman .rq-who{display:block;font-size:11px;font-weight:800;color:var(--violet)}

`;
