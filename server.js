// 건축물대장 간편열람 앱 - 수정본
// Replit의 server.js 전체를 이 코드로 교체하세요.

const http = require("http");
const { URL } = require("url");

const PORT = process.env.PORT || 3000;
const JUSO_KEY = process.env.JUSO_KEY || "";
const BLDG_KEY = process.env.BLDG_KEY || "";
const BLDG_BASE_URL = "https://apis.data.go.kr/1613000/BldRgstHubService";

function pad4(value) {
  const s = String(value || "0");
  return s.padStart(4, "0");
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(data));
}

function sendHtml(res, html) {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

async function fetchJson(url) {
  const r = await fetch(url.toString());
  const text = await r.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(
      "API 응답을 읽지 못했습니다. 인증키 또는 API 주소를 확인하세요.",
    );
  }
}

function arrayOf(item) {
  if (!item) return [];
  return Array.isArray(item) ? item : [item];
}

async function searchAddress(keyword) {
  if (!JUSO_KEY) throw new Error("JUSO_KEY가 없습니다.");

  const u = new URL("https://business.juso.go.kr/addrlink/addrLinkApi.do");
  u.searchParams.set("confmKey", JUSO_KEY);
  u.searchParams.set("currentPage", "1");
  u.searchParams.set("countPerPage", "20");
  u.searchParams.set("keyword", keyword);
  u.searchParams.set("resultType", "json");

  const data = await fetchJson(u);
  const common = data.results && data.results.common ? data.results.common : {};
  const list = data.results && data.results.juso ? data.results.juso : [];

  if (common.errorCode && common.errorCode !== "0") {
    throw new Error(common.errorMessage || "주소 검색 실패");
  }

  return list.map(function (a) {
    const admCd = String(a.admCd || "");
    return {
      roadAddr: a.roadAddr || "",
      jibunAddr: a.jibunAddr || "",
      sigunguCd: admCd.slice(0, 5),
      bjdongCd: admCd.slice(5, 10),
      platGbCd: String(a.mtYn || "0") === "1" ? "1" : "0",
      bun: pad4(a.lnbrMnnm),
      ji: pad4(a.lnbrSlno),
    };
  });
}

function parseXmlItems(xml) {
  const items = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let itemMatch;
  while ((itemMatch = itemRe.exec(xml)) !== null) {
    const block = itemMatch[1];
    const obj = {};
    const tagRe = /<([^/>\s]+)>([^<]*)<\/\1>/g;
    let tagMatch;
    while ((tagMatch = tagRe.exec(block)) !== null) {
      obj[tagMatch[1]] = tagMatch[2].trim();
    }
    if (Object.keys(obj).length > 0) items.push(obj);
  }
  return items;
}

async function callLedger(path, q) {
  if (!BLDG_KEY) throw new Error("BLDG_KEY가 없습니다.");

  const u = new URL(BLDG_BASE_URL + "/" + path);
  u.searchParams.set("serviceKey", BLDG_KEY);
  u.searchParams.set("sigunguCd", q.sigunguCd);
  u.searchParams.set("bjdongCd", q.bjdongCd);
  u.searchParams.set("platGbCd", q.platGbCd || "0");
  u.searchParams.set("bun", q.bun || "0000");
  u.searchParams.set("ji", q.ji || "0000");
  u.searchParams.set("numOfRows", q.numOfRows || "100");
  u.searchParams.set("pageNo", "1");
  u.searchParams.set("_type", "json");

  const r = await fetch(u.toString());
  const text = await r.text();
  const trimmed = text.trimStart();

  if (trimmed.startsWith("<")) {
    return parseXmlItems(text);
  }

  try {
    const data = JSON.parse(text);
    const body = data.response && data.response.body ? data.response.body : {};
    return body.items && body.items.item ? arrayOf(body.items.item) : [];
  } catch (e) {
    throw new Error("건축물대장 API 응답을 읽지 못했습니다.");
  }
}

async function getLedger(q) {
  const a = await Promise.all([
    callLedger("getBrRecapTitleInfo", q),
    callLedger("getBrTitleInfo", q),
    callLedger("getBrFlrOulnInfo", Object.assign({}, q, { numOfRows: "200" })),
  ]);
  return { recap: a[0], title: a[1], floor: a[2] };
}

const INDEX_HTML = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>건축물대장 간편열람</title>
<style>
body{margin:0;font-family:Arial,sans-serif;background:#f4f6fb;color:#172033}.wrap{max-width:900px;margin:0 auto;padding:18px}.hero{background:#1f5eff;color:white;border-radius:22px;padding:22px}.card{background:white;border-radius:18px;padding:16px;margin-top:14px;box-shadow:0 8px 22px #0001}.row{display:flex;gap:8px}input{flex:1;padding:14px;border:1px solid #d5dbea;border-radius:12px;font-size:16px}button{padding:13px 16px;border:0;border-radius:12px;background:#1f5eff;color:white;font-weight:800}.secondary{background:#111827}.ok{background:#ecfdf5;color:#065f46;border:1px solid #a7f3d0;padding:12px;border-radius:12px}.warn{background:#fff7ed;color:#9a3412;border:1px solid #fed7aa;padding:12px;border-radius:12px}.addr{border:1px solid #e2e8f0;border-radius:14px;padding:12px;margin-top:10px}.muted{color:#64748b;font-size:14px}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.field{background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:10px}.k{color:#64748b;font-size:12px}.v{font-weight:800}.pill{display:inline-block;background:#eef2ff;color:#3730a3;border-radius:999px;padding:5px 8px;font-size:12px;font-weight:800;margin:2px}table{width:100%;border-collapse:collapse;margin-top:8px}td,th{border-bottom:1px solid #e2e8f0;padding:8px;text-align:left}.mapbtns{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.mapbtn{padding:6px 11px;border:0;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;text-decoration:none;display:inline-block;background:#fee500;color:#3c1e1e}.govbtns{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.govbtn{padding:10px 14px;border:0;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;text-decoration:none;display:inline-block;background:#1f5eff;color:white}.calc-box{margin-top:6px}.calc-row{display:flex;align-items:center;gap:8px;margin-top:10px}.calc-row label{min-width:160px;font-size:14px;color:#475569}.calc-row input{width:90px;padding:8px;border:1px solid #d5dbea;border-radius:8px;font-size:14px}.calc-out{background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px;margin-top:14px}.calc-out-row{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #f1f5f9;font-size:14px}.calc-out-row:last-child{border-bottom:none}.calc-note{background:#fff7ed;color:#9a3412;border:1px solid #fed7aa;border-radius:10px;padding:10px;margin-top:12px;font-size:12px}@media(max-width:680px){.row{flex-direction:column}.grid{grid-template-columns:1fr}button{width:100%}.calc-row{flex-direction:column;align-items:flex-start}.govbtns{flex-direction:column}}
</style>
</head>
<body>
<div class="wrap">
<section class="hero"><h1>건축물대장 간편열람</h1><p>주소를 입력하고 건물을 선택하세요.</p></section>
<section class="card"><div id="keyStatus">API 키 확인 중...</div></section>
<section class="card"><h2>1. 주소 입력</h2><div class="row"><input id="keyword" placeholder="예: 서울 강남구 테헤란로 152"><button id="searchBtn">주소 찾기</button></div><div id="addressList"></div></section>
<section id="resultCard" class="card" style="display:none"><h2>2. 건축물대장 열람</h2><div id="selectedAddress" class="muted"></div><div id="ledgerResult"></div><div id="govLinks" style="display:none;margin-top:16px"><h3 style="margin:0 0 4px">공식 문서 열람/발급</h3><div class="govbtns"><a class="govbtn" href="https://www.gov.kr/mw/AA020InfoCappView.do?CappBizCD=16130000139&HighCtgCD=A09005&tp_seq=" target="_blank" rel="noopener">정부24 건축물현황도 열람/발급</a><a class="govbtn" href="https://www.eais.go.kr" target="_blank" rel="noopener">세움터 건축물현황도 확인</a></div></div></section>
<section class="card"><h2>옥상 태양광 예상 발전량 계산</h2><div class="calc-box"><div class="calc-row"><label>옥상 면적 (㎡)</label><input id="cM2" type="number" min="0" placeholder="예: 330"></div><div class="calc-row"><label>실제 설치 가능 비율 (%)</label><input id="cRate" type="number" min="0" max="100" value="70"></div><div class="calc-row"><label>일평균 발전시간 (h)</label><input id="cSun" type="number" min="0" step="0.1" value="3.5"></div><button onclick="calcSolar()" style="margin-top:14px;width:100%">계산하기</button><div id="calcOut"></div></div></section>
</div>
<script>
var selectedMap = {};
var keyStatus = document.getElementById('keyStatus');
var keyword = document.getElementById('keyword');
var searchBtn = document.getElementById('searchBtn');
var addressList = document.getElementById('addressList');
var resultCard = document.getElementById('resultCard');
var selectedAddress = document.getElementById('selectedAddress');
var ledgerResult = document.getElementById('ledgerResult');
var govLinks = document.getElementById('govLinks');

function esc(v){return String(v==null?'':v).split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;').split('"').join('&quot;')}
function val(v){return v || '-'}
function field(k,v){return '<div class="field"><div class="k">'+esc(k)+'</div><div class="v">'+esc(val(v))+'</div></div>'}
async function api(path){var r=await fetch(path);var d=await r.json();if(!r.ok||d.error)throw new Error(d.error||'오류');return d}

async function health(){await api('/api/health');keyStatus.className='ok';keyStatus.textContent='준비 완료: 서비스 사용 가능';}

async function search(){
  var q=keyword.value.trim();
  if(!q){alert('주소를 입력하세요.');return}
  addressList.innerHTML='조회 중...';
  resultCard.style.display='none';
  try{
    var d=await api('/api/address?keyword='+encodeURIComponent(q));
    selectedMap={};
    if(!d.items.length){addressList.innerHTML='<div class="warn">주소가 없습니다.</div>';return}
    addressList.innerHTML=d.items.map(function(a,i){selectedMap[i]=a;var enc=encodeURIComponent(a.roadAddr);var kakao='https://map.kakao.com/?q='+enc;return '<div class="addr"><b>'+esc(a.roadAddr)+'</b><div class="muted">지번: '+esc(a.jibunAddr)+'</div><div><span class="pill">'+esc(a.sigunguCd)+'</span><span class="pill">'+esc(a.bjdongCd)+'</span><span class="pill">'+esc(a.bun)+'-'+esc(a.ji)+'</span></div><div class="mapbtns"><a class="mapbtn" href="'+kakao+'" target="_blank" rel="noopener">카카오맵 보기</a><a class="mapbtn" href="'+kakao+'" target="_blank" rel="noopener">로드뷰 보기</a><a class="mapbtn" href="'+kakao+'" target="_blank" rel="noopener">스카이뷰 보기</a></div><button class="secondary" onclick="loadLedger('+i+')">이 주소로 열람</button></div>'}).join('')
  }catch(e){addressList.innerHTML='<div class="warn">'+esc(e.message)+'</div>'}
}

async function loadLedger(i){
  var a=selectedMap[i];
  resultCard.style.display='block';
  selectedAddress.innerHTML='선택 주소: <b>'+esc(a.roadAddr)+'</b>';
  ledgerResult.innerHTML='건축물대장 조회 중...';
  var p=new URLSearchParams({sigunguCd:a.sigunguCd,bjdongCd:a.bjdongCd,platGbCd:a.platGbCd,bun:a.bun,ji:a.ji});
  try{var d=await api('/api/ledger?'+p.toString());ledgerResult.innerHTML=renderLedger(d);govLinks.style.display='block';resultCard.scrollIntoView({behavior:'smooth'})}catch(e){ledgerResult.innerHTML='<div class="warn">'+esc(e.message)+'</div>';govLinks.style.display='none'}
}

function renderBuilding(x,label){return '<div class="card" style="box-shadow:none;border:1px solid #e2e8f0"><span class="pill">'+label+'</span><div class="grid">'+field('건물명',x.bldNm)+field('대장종류',x.regstrKindCdNm)+field('도로명주소',x.newPlatPlc)+field('지번주소',x.platPlc)+field('동명칭',x.dongNm)+field('주용도',x.mainPurpsCdNm||x.etcPurps)+field('구조',x.strctCdNm||x.etcStrct)+field('층수','지상 '+val(x.grndFlrCnt)+'층 / 지하 '+val(x.ugrndFlrCnt)+'층')+field('연면적',x.totArea?x.totArea+'㎡':'-')+field('건축면적',x.archArea?x.archArea+'㎡':'-')+field('사용승인일',x.useAprDay)+field('허가일',x.pmsDay)+'</div></div>'}
function renderFloor(items){if(!items.length)return '';var rows=items.slice(0,80).map(function(f){return '<tr><td>'+esc(val(f.dongNm))+'</td><td>'+esc(val(f.flrNoNm))+'</td><td>'+esc(val(f.mainPurpsCdNm||f.etcPurps))+'</td><td>'+esc(f.area?f.area+'㎡':'-')+'</td></tr>'}).join('');return '<h3>층별개요</h3><table><tr><th>동</th><th>층</th><th>용도</th><th>면적</th></tr>'+rows+'</table>'}
function renderLedger(d){var r=d.recap||[],t=d.title||[],f=d.floor||[];if(!r.length&&!t.length&&!f.length)return '<div class="warn">조회 결과가 없습니다.</div>';var h='<div class="ok">열람 성공</div>';h+=r.slice(0,5).map(function(x){return renderBuilding(x,'총괄표제부')}).join('');h+=t.slice(0,30).map(function(x,n){return renderBuilding(x,'표제부 '+(n+1))}).join('');h+=renderFloor(f);return h}

function calcSolar(){
  var rooftopM2=parseFloat(document.getElementById('cM2').value);
  var rate=parseFloat(document.getElementById('cRate').value);
  var sun=parseFloat(document.getElementById('cSun').value);
  var out=document.getElementById('calcOut');
  if(isNaN(rooftopM2)||rooftopM2<=0){out.innerHTML='<div class="warn" style="margin-top:10px">옥상 면적을 입력하세요.</div>';return}
  if(isNaN(rate)||rate<=0||rate>100){out.innerHTML='<div class="warn" style="margin-top:10px">설치 가능 비율을 1~100 사이로 입력하세요.</div>';return}
  if(isNaN(sun)||sun<=0){out.innerHTML='<div class="warn" style="margin-top:10px">일평균 발전시간을 입력하세요.</div>';return}
  var usableM2=rooftopM2*rate/100;
  var capacityKw=usableM2/7.67;
  var dailyKwh=capacityKw*sun;
  var monthlyKwh=dailyKwh*30;
  var yearlyKwh=dailyKwh*365;
  function r2(n){return Math.round(n*100)/100}
  out.innerHTML='<div class="calc-out">'
    +'<div class="calc-out-row"><span>입력 옥상면적</span><span>'+r2(rooftopM2)+'㎡</span></div>'
    +'<div class="calc-out-row"><span>실제 설치 가능 면적</span><span>'+r2(usableM2)+'㎡</span></div>'
    +'<div class="calc-out-row"><span>예상 설치용량</span><span>'+r2(capacityKw)+' kW</span></div>'
    +'<div class="calc-out-row"><span>하루 예상 발전량</span><span>'+r2(dailyKwh)+' kWh</span></div>'
    +'<div class="calc-out-row"><span>월 예상 발전량</span><span>'+r2(monthlyKwh)+' kWh</span></div>'
    +'<div class="calc-out-row"><span>연간 예상 발전량</span><span>'+r2(yearlyKwh)+' kWh</span></div>'
    +'</div>'
    +'<div class="calc-note">이 계산은 간이 추정입니다. 실제 발전량은 음영, 방향, 구조안전, 설비 배치, 인허가, 계통연계 조건에 따라 달라질 수 있습니다.</div>';
}

searchBtn.onclick=search;
keyword.onkeydown=function(e){if(e.key==='Enter')search()};
health().catch(function(e){keyStatus.className='warn';keyStatus.textContent=e.message});
</script>
</body>
</html>`;

const server = http.createServer(async function (req, res) {
  try {
    const url = new URL(req.url, "http://" + req.headers.host);

    if (url.pathname === "/") return sendHtml(res, INDEX_HTML);

    if (url.pathname === "/favicon.ico") {
      res.writeHead(204);
      return res.end();
    }

    if (url.pathname === "/api/health") {
      let jusoStatus = "missing";
      let bldgStatus = Boolean(BLDG_KEY) ? "ok" : "missing";

      if (JUSO_KEY) {
        try {
          const u = new URL("https://business.juso.go.kr/addrlink/addrLinkApi.do");
          u.searchParams.set("confmKey", JUSO_KEY);
          u.searchParams.set("currentPage", "1");
          u.searchParams.set("countPerPage", "1");
          u.searchParams.set("keyword", "서울");
          u.searchParams.set("resultType", "json");
          const r = await fetch(u.toString());
          const d = await r.json();
          const ec = d.results && d.results.common && d.results.common.errorCode;
          jusoStatus = ec === "0" ? "ok" : "unauthorized";
        } catch (e) {
          jusoStatus = "error";
        }
      }

      return sendJson(res, 200, { jusoStatus, bldgStatus });
    }

    if (url.pathname === "/api/address") {
      const keyword = url.searchParams.get("keyword") || "";
      if (!keyword.trim())
        return sendJson(res, 400, { error: "주소를 입력하세요." });
      const items = await searchAddress(keyword.trim());
      return sendJson(res, 200, { items: items });
    }

    if (url.pathname === "/api/ledger") {
      const q = {
        sigunguCd: url.searchParams.get("sigunguCd"),
        bjdongCd: url.searchParams.get("bjdongCd"),
        platGbCd: url.searchParams.get("platGbCd") || "0",
        bun: url.searchParams.get("bun") || "0000",
        ji: url.searchParams.get("ji") || "0000",
      };
      const data = await getLedger(q);
      return sendJson(res, 200, data);
    }

    sendJson(res, 404, { error: "없는 페이지입니다." });
  } catch (e) {
    sendJson(res, 500, { error: e.message || "서버 오류" });
  }
});

server.listen(PORT, function () {
  console.log("건축물대장 간편열람 앱 실행 중");
});
