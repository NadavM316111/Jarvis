require('dotenv').config({ path: '.env.local' });
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const cloudscraper = require('cloudscraper');
let screenshot;
try { screenshot = require('screenshot-desktop'); } catch(e) { screenshot = null; }
const { execSync, exec, spawn } = require('child_process');
// Install ffmpeg if not available
try {
  execSync('which ffmpeg', { stdio: 'ignore' });
} catch(e) {
  console.log('[FFMPEG] Installing ffmpeg...');
  try {
    execSync('apt-get install -y ffmpeg', { stdio: 'inherit' });
    console.log('[FFMPEG] Installed successfully');
  } catch(e2) {
    console.log('[FFMPEG] Install failed:', e2.message);
  }
}
let robot;
try { robot = require('@jitsi/robotjs'); } catch(e) { robot = null; }
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
// ============================================================
// JARVIS PRESENTATION GENERATOR — paste into server.js
// ============================================================
// 1. Install deps (run once in your Jarvis dir):
//    npm install pptxgenjs axios sharp react react-dom react-icons
//
// 2. Add the `generate_presentation` tool to the tools[] array
//    inside runAgenticLoop (add before the 'finish' tool):
//
//    {
//      name: 'generate_presentation',
//      description: 'Generate a beautiful PowerPoint presentation (.pptx) with images, icons, charts, and nice transitions. Always use this instead of run_code when asked to create a presentation, slides, or slideshow.',
//      input_schema: {
//        type: 'object',
//        properties: {
//          title: { type: 'string', description: 'Presentation title' },
//          theme: { type: 'string', enum: ['dark', 'light', 'navy', 'minimal'], description: 'Visual theme' },
//          slides: {
//            type: 'array',
//            description: 'Array of slide objects',
//            items: {
//              type: 'object',
//              properties: {
//                type: { type: 'string', enum: ['title', 'content', 'two-column', 'image-full', 'stats', 'quote', 'timeline', 'agenda'] },
//                title: { type: 'string' },
//                subtitle: { type: 'string' },
//                body: { type: 'array', items: { type: 'string' }, description: 'Bullet points or paragraphs' },
//                left: { type: 'array', items: { type: 'string' }, description: 'Left column bullets (two-column slides)' },
//                right: { type: 'array', items: { type: 'string' }, description: 'Right column bullets (two-column slides)' },
//                stats: { type: 'array', items: { type: 'object', properties: { value: { type: 'string' }, label: { type: 'string' } } }, description: 'Big stat callouts' },
//                quote: { type: 'string', description: 'Pull quote text' },
//                attribution: { type: 'string', description: 'Quote attribution' },
//                steps: { type: 'array', items: { type: 'string' }, description: 'Timeline steps' },
//                imageSearch: { type: 'string', description: 'Search query to find a background or section image' },
//                speakerNotes: { type: 'string' }
//              }
//            }
//          },
//          filename: { type: 'string', description: 'Output filename without extension' }
//        },
//        required: ['title', 'slides', 'filename']
//      }
//    }
//
// 3. Add the handler inside the `if (block.name === 'run_code')` chain:
//
//    else if (block.name === 'generate_presentation') {
//      result = await generatePresentation(block.input);
//    }
//
// ============================================================

const pptxgen = require('pptxgenjs');
const sharp   = require('sharp');
const React   = require('react');
const ReactDOMServer = require('react-dom/server');

// ── Theme definitions ─────────────────────────────────────────────────────────
const THEMES = {
  dark: {
    bg: '0F1117', bgAlt: '1A1D2E', accent: '6366F1', accent2: '8B5CF6',
    text: 'F8FAFC', subtext: '94A3B8', card: '1E2235', border: '2D3151',
    titleBg: '0F1117', chartColors: ['6366F1','8B5CF6','EC4899','F59E0B','10B981','06B6D4'],
    gradStart: '0F1117', gradEnd: '1A1D2E',
  },
  light: {
    bg: 'FFFFFF', bgAlt: 'F1F5F9', accent: '4F46E5', accent2: '7C3AED',
    text: '0F172A', subtext: '64748B', card: 'FFFFFF', border: 'CBD5E1',
    titleBg: '4F46E5', chartColors: ['4F46E5','7C3AED','DB2777','D97706','059669','0891B2'],
    gradStart: '4F46E5', gradEnd: '7C3AED',
  },
  navy: {
    bg: '0A1628', bgAlt: '0F2040', accent: '3B82F6', accent2: '60A5FA',
    text: 'F0F9FF', subtext: '93C5FD', card: '162036', border: '1E3A5F',
    titleBg: '0A1628', chartColors: ['3B82F6','60A5FA','34D399','FBBF24','F87171','A78BFA'],
    gradStart: '0A1628', gradEnd: '162036',
  },
  minimal: {
    bg: 'FAFAFA', bgAlt: 'FFFFFF', accent: '18181B', accent2: '52525B',
    text: '18181B', subtext: '71717A', card: 'FFFFFF', border: 'E4E4E7',
    titleBg: '18181B', chartColors: ['18181B','52525B','3B82F6','10B981','F59E0B','EF4444'],
    gradStart: '18181B', gradEnd: '3F3F46',
  },
  corporate: {
    bg: 'FFFFFF', bgAlt: 'EFF6FF', accent: '1D4ED8', accent2: '2563EB',
    text: '1E293B', subtext: '475569', card: 'F8FAFC', border: 'BFDBFE',
    titleBg: '1D4ED8', chartColors: ['1D4ED8','2563EB','7C3AED','DC2626','16A34A','D97706'],
    gradStart: '1D4ED8', gradEnd: '7C3AED',
  },
};

// ── Image fetcher ──────────────────────────────────────────────────────────────
async function fetchSlideImage(query) {
  try {
    const searchRes = await axios.get('https://api.search.brave.com/res/v1/images/search', {
      headers: { 'Accept': 'application/json', 'Accept-Encoding': 'gzip', 'X-Subscription-Token': process.env.BRAVE_SEARCH_API_KEY },
      params: { q: query, count: 3, safesearch: 'strict' }
    });
    const results = searchRes.data?.results || [];
    for (const img of results) {
      try {
        const imgUrl = img.properties?.url || img.thumbnail?.src;
        if (!imgUrl) continue;
        const resp = await axios.get(imgUrl, { responseType: 'arraybuffer', timeout: 6000, maxRedirects: 3 });
        const ct = resp.headers['content-type'] || 'image/jpeg';
        if (!ct.startsWith('image/')) continue;
        const b64 = Buffer.from(resp.data).toString('base64');
        return `${ct};base64,${b64}`;
      } catch {}
    }
    return null;
  } catch (e) { return null; }
}

// ── Transition cycle ───────────────────────────────────────────────────────────
const TRANSITION_SEQUENCE = ['fade','push','wipe','reveal','zoom','split'];
function makeTransition(i) {
  const t = TRANSITION_SEQUENCE[i % TRANSITION_SEQUENCE.length];
  const map = { fade:{type:'fade',dur:500}, push:{type:'push',dir:'l',dur:500},
    wipe:{type:'wipe',dir:'l',dur:500}, reveal:{type:'reveal',dir:'l',dur:500},
    zoom:{type:'zoom',dir:'in',dur:500}, split:{type:'split',dir:'h',dur:500} };
  return map[t];
}

// ── Main PowerPoint generator ──────────────────────────────────────────────────
async function generatePresentation({ title, theme = 'dark', slides, filename }) {
  const T = THEMES[theme] || THEMES.dark;
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_16x9';
  pres.author = 'JARVIS'; pres.title = title; pres.subject = title;

  pres.defineSlideMaster({ title: 'JARVIS_MASTER', background: { color: T.bg } });

  // ── helpers ────────────────────────────────────────────────────────────────
  function hdr(slide, slideTitle, accentColor = T.accent) {
    slide.addShape(pres.shapes.RECTANGLE, { x:0, y:0, w:10, h:0.82, fill:{color:T.bgAlt}, line:{color:T.bgAlt} });
    slide.addShape(pres.shapes.RECTANGLE, { x:0, y:0, w:0.09, h:0.82, fill:{color:accentColor}, line:{color:accentColor} });
    if (slideTitle) slide.addText(slideTitle, { x:0.22, y:0, w:9.5, h:0.82, fontSize:21, bold:true, color:T.text, fontFace:'Calibri', valign:'middle', margin:0 });
  }
  function footer(slide) {
    slide.addShape(pres.shapes.RECTANGLE, { x:0, y:5.43, w:10, h:0.07, fill:{color:T.accent,transparency:50}, line:{color:T.accent,transparency:50} });
    slide.addText('JARVIS · ' + title, { x:0.3, y:5.3, w:9.4, h:0.25, fontSize:7, color:T.subtext, align:'right', valign:'bottom' });
  }
  function card(slide, x, y, w, h, col = T.bgAlt) {
    slide.addShape(pres.shapes.RECTANGLE, { x, y, w, h, fill:{color:col}, line:{color:T.border,pt:0.5},
      shadow:{type:'outer',color:'000000',blur:8,offset:2,angle:135,opacity:0.15} });
  }

  // ── slide renderers ────────────────────────────────────────────────────────
  for (let i = 0; i < slides.length; i++) {
    const sd = slides[i];
    const slide = pres.addSlide({ masterName: 'JARVIS_MASTER' });
    slide.transition = makeTransition(i);
    if (sd.speakerNotes) slide.addNotes(sd.speakerNotes);
    let bgImg = sd.imageSearch ? await fetchSlideImage(sd.imageSearch) : null;

    switch (sd.type) {

      // ── TITLE (dark gradient) ──────────────────────────────────────────────
      case 'title': {
        // gradient via two overlapping rects
        slide.addShape(pres.shapes.RECTANGLE, { x:0, y:0, w:10, h:5.625, fill:{color:T.gradStart}, line:{color:T.gradStart} });
        slide.addShape(pres.shapes.RECTANGLE, { x:5, y:0, w:5, h:5.625, fill:{color:T.gradEnd,transparency:50}, line:{color:T.gradEnd,transparency:50} });
        // decorative circles
        slide.addShape(pres.shapes.OVAL, { x:7.5, y:-1.8, w:5.5, h:5.5, fill:{color:T.accent,transparency:78}, line:{color:T.accent,transparency:78} });
        slide.addShape(pres.shapes.OVAL, { x:8.2, y:-0.9, w:3.8, h:3.8, fill:{color:T.accent2,transparency:70}, line:{color:T.accent2,transparency:70} });
        // vertical accent bar
        slide.addShape(pres.shapes.RECTANGLE, { x:0.55, y:1.35, w:0.11, h:2.6, fill:{color:T.accent2}, line:{color:T.accent2} });
        // title
        slide.addText(sd.title || title, { x:0.85, y:1.3, w:7.8, h:1.8, fontSize:42, bold:true, color:'FFFFFF', fontFace:'Calibri', valign:'middle', glow:{size:8,color:T.accent,opacity:0.3} });
        if (sd.subtitle) slide.addText(sd.subtitle, { x:0.85, y:3.15, w:7.5, h:0.9, fontSize:19, color:'FFFFFFCC', fontFace:'Calibri Light', valign:'top' });
        // bottom strip
        slide.addShape(pres.shapes.RECTANGLE, { x:0, y:5.05, w:10, h:0.575, fill:{color:T.accent,transparency:20}, line:{color:T.accent,transparency:20} });
        slide.addText('JARVIS  ·  ' + new Date().getFullYear(), { x:0.4, y:5.07, w:9.2, h:0.5, fontSize:9, color:'FFFFFF99', align:'right', valign:'middle' });
        if (bgImg) {
          slide.addImage({ data: bgImg, x:6.5, y:0.8, w:3.3, h:3.8, sizing:{type:'cover',w:3.3,h:3.8}, transparency:20 });
        }
        break;
      }

      // ── COVER-DARK (full bleed image + text overlay) ──────────────────────
      case 'cover-dark': {
        slide.background = { color: '000000' };
        if (bgImg) slide.addImage({ data:bgImg, x:0, y:0, w:10, h:5.625, sizing:{type:'cover',w:10,h:5.625}, transparency:0 });
        slide.addShape(pres.shapes.RECTANGLE, { x:0, y:0, w:10, h:5.625, fill:{color:'000000',transparency:45}, line:{color:'000000',transparency:45} });
        slide.addShape(pres.shapes.RECTANGLE, { x:0, y:3.8, w:10, h:1.825, fill:{color:'000000',transparency:20}, line:{color:'000000',transparency:20} });
        slide.addShape(pres.shapes.RECTANGLE, { x:0, y:3.8, w:0.13, h:1.825, fill:{color:T.accent}, line:{color:T.accent} });
        slide.addText(sd.title||'', { x:0.3, y:3.85, w:9.4, h:0.9, fontSize:30, bold:true, color:'FFFFFF', fontFace:'Calibri', valign:'middle' });
        if (sd.subtitle) slide.addText(sd.subtitle, { x:0.3, y:4.8, w:9.4, h:0.55, fontSize:15, color:'FFFFFFCC', fontFace:'Calibri Light', valign:'top' });
        break;
      }

      // ── CONTENT (bullets + optional image) ────────────────────────────────
      case 'content': {
        slide.background = { color: T.bg };
        hdr(slide, sd.title);
        const cw = bgImg ? 5.0 : 9.2;
        if (bgImg) {
          slide.addImage({ data:bgImg, x:5.35, y:0.9, w:4.45, h:4.45, sizing:{type:'cover',w:4.45,h:4.45} });
          slide.addShape(pres.shapes.RECTANGLE, { x:5.35, y:0.9, w:4.45, h:4.45, fill:{color:T.bg,transparency:15}, line:{color:T.bg,transparency:15} });
        }
        const items = (sd.body||[]).map((b,j) => {
          const isEmoji = /^[\u{1F300}-\u{1FAFF}✓✗→◆•★]/u.test(b);
          return { text: isEmoji ? b : '◆  ' + b, options: { breakLine: j < (sd.body||[]).length-1, fontSize:14.5, color:T.text, fontFace:'Calibri', paraSpaceAfter:10 }};
        });
        if (items.length) slide.addText(items, { x:0.45, y:1.0, w:cw, h:4.35, valign:'top' });
        footer(slide);
        break;
      }

      // ── TWO-COLUMN ─────────────────────────────────────────────────────────
      case 'two-column': {
        slide.background = { color: T.bg };
        hdr(slide, sd.title, T.accent2);
        slide.addShape(pres.shapes.LINE, { x:5.05, y:0.95, w:0, h:4.3, line:{color:T.border,pt:1} });
        [[sd.left||[], 0.3, 4.5],[sd.right||[], 5.25, 4.45]].forEach(([arr, x, w]) => {
          card(slide, x, 0.9, w, 4.38);
          const items = arr.map((b,j) => ({ text:'◆  '+b, options:{bullet:false, breakLine:j<arr.length-1, fontSize:13.5, color:T.text, fontFace:'Calibri', paraSpaceAfter:8} }));
          if (items.length) slide.addText(items, { x:x+0.15, y:1.05, w:w-0.25, h:4.1, valign:'top' });
        });
        footer(slide);
        break;
      }

      // ── STATS ──────────────────────────────────────────────────────────────
      case 'stats': {
  slide.background = { color: T.bg };
  hdr(slide, sd.title);
  const stats = sd.stats || [];
  const n = Math.min(stats.length, 4);
  const totalW = 9.2;
  const gap = 0.15;
  const cw2 = (totalW - gap * (n - 1)) / n;
  stats.slice(0, 4).forEach((s, idx) => {
    const cx = 0.4 + idx * (cw2 + gap);
    const col = T.chartColors[idx % T.chartColors.length];
    // Card background
    slide.addShape(pres.shapes.RECTANGLE, { x:cx, y:1.0, w:cw2, h:3.9,
      fill:{color:col, transparency:88}, line:{color:col, pt:1.5},
      shadow:{type:'outer',color:'000000',blur:10,offset:3,angle:135,opacity:0.2} });
    // Top accent bar
    slide.addShape(pres.shapes.RECTANGLE, { x:cx, y:1.0, w:cw2, h:0.09, fill:{color:col}, line:{color:col} });
    // Big value — sized to fit
    const valFontSize = n <= 2 ? 56 : n === 3 ? 46 : 38;
    slide.addText(s.value||'', {
      x:cx+0.08, y:1.55, w:cw2-0.16, h:1.8,
      fontSize:valFontSize, bold:true, color:col,
      fontFace:'Calibri', align:'center', valign:'middle',
      fit:'shrink'
    });
    // Divider line
    slide.addShape(pres.shapes.LINE, {
      x:cx+cw2*0.25, y:3.45, w:cw2*0.5, h:0,
      line:{color:col, pt:1.2}
    });
    // Label — always fits, no overlap
    slide.addText(s.label||'', {
      x:cx+0.08, y:3.55, w:cw2-0.16, h:0.95,
      fontSize:11, color:T.subtext, fontFace:'Calibri',
      align:'center', valign:'top', wrap:true
    });
  });
  footer(slide);
  break;
}

      // ── QUOTE ──────────────────────────────────────────────────────────────
      case 'quote': {
        slide.background = { color: T.titleBg };
        slide.addText('\u201C', { x:0.3, y:0.05, w:2.5, h:2.2, fontSize:130, color:T.accent, fontFace:'Georgia', align:'left', valign:'top', transparency:55 });
        const quoteColor = T.bg === '0F1117' || T.bg === '0A1628' ? 'F1F5F9' : T.text;
slide.addText(sd.quote||'', { x:0.9, y:1.3, w:8.2, h:2.85, fontSize:22, italic:true, color:quoteColor, fontFace:'Georgia', align:'center', valign:'middle', lineSpacingMultiple:1.5 });
        if (sd.attribution) {
          slide.addShape(pres.shapes.RECTANGLE, { x:3.6, y:4.4, w:2.8, h:0.04, fill:{color:T.accent}, line:{color:T.accent} });
          slide.addText('\u2014 ' + sd.attribution, { x:0.5, y:4.55, w:9, h:0.5, fontSize:14, color:T.subtext, fontFace:'Calibri Light', align:'center' });
        }
        footer(slide);
        break;
      }

      // ── TIMELINE ───────────────────────────────────────────────────────────
      case 'timeline': {
        slide.background = { color: T.bg };
        hdr(slide, sd.title, T.accent2);
        const steps = sd.steps||[];
        const n2 = Math.min(steps.length, 6);
        const sw = 9.2 / n2;
        // spine
        slide.addShape(pres.shapes.RECTANGLE, { x:0.4+sw/2, y:2.47, w:sw*(n2-1), h:0.05, fill:{color:T.accent,transparency:30}, line:{color:T.accent,transparency:30} });
        steps.slice(0,6).forEach((step, idx) => {
          const cx = 0.4 + idx*sw + sw/2;
          const col = T.chartColors[idx % T.chartColors.length];
          slide.addShape(pres.shapes.OVAL, { x:cx-0.3, y:2.2, w:0.6, h:0.6, fill:{color:col}, line:{color:col} });
          slide.addText(String(idx+1), { x:cx-0.3, y:2.2, w:0.6, h:0.6, fontSize:13, bold:true, color:'FFFFFF', align:'center', valign:'middle' });
          slide.addText(step, { x:cx-sw/2+0.08, y:2.88, w:sw-0.16, h:2.4, fontSize:Math.max(9, 13-n2), color:T.text, fontFace:'Calibri', align:'center', valign:'top', wrap:true });
          if (idx%2===0) slide.addShape(pres.shapes.OVAL, { x:cx-0.07, y:1.7, w:0.14, h:0.14, fill:{color:col,transparency:30}, line:{color:col,transparency:30} });
        });
        footer(slide);
        break;
      }

      // ── AGENDA ─────────────────────────────────────────────────────────────
      case 'agenda': {
        slide.background = { color: T.bg };
        hdr(slide, sd.title||'Agenda');
        const items2 = sd.body||[];
        const ch = Math.min(0.68, 4.3/items2.length);
        items2.slice(0,7).forEach((item, idx) => {
          const oy = 0.98 + idx*(ch+0.09);
          const col = T.chartColors[idx % T.chartColors.length];
          card(slide, 0.4, oy, 9.2, ch);
          slide.addShape(pres.shapes.RECTANGLE, { x:0.4, y:oy, w:0.06, h:ch, fill:{color:col}, line:{color:col} });
          slide.addShape(pres.shapes.OVAL, { x:0.6, y:oy+ch/2-0.22, w:0.44, h:0.44, fill:{color:col}, line:{color:col} });
          slide.addText(String(idx+1), { x:0.6, y:oy+ch/2-0.22, w:0.44, h:0.44, fontSize:12, bold:true, color:'FFFFFF', align:'center', valign:'middle' });
          slide.addText(item, { x:1.2, y:oy, w:8.1, h:ch, fontSize:13.5, color:T.text, fontFace:'Calibri', valign:'middle' });
        });
        footer(slide);
        break;
      }

      // ── IMAGE-FULL ─────────────────────────────────────────────────────────
      case 'image-full': {
        slide.background = { color: T.bg };
        if (bgImg) slide.addImage({ data:bgImg, x:0, y:0, w:10, h:5.625, sizing:{type:'cover',w:10,h:5.625} });
        slide.addShape(pres.shapes.RECTANGLE, { x:0, y:0, w:10, h:5.625, fill:{color:'000000',transparency:40}, line:{color:'000000',transparency:40} });
        slide.addShape(pres.shapes.RECTANGLE, { x:0, y:3.95, w:10, h:1.675, fill:{color:'000000',transparency:25}, line:{color:'000000',transparency:25} });
        slide.addShape(pres.shapes.RECTANGLE, { x:0, y:3.95, w:0.13, h:1.675, fill:{color:T.accent}, line:{color:T.accent} });
        slide.addText(sd.title||'', { x:0.25, y:4.0, w:9.5, h:0.8, fontSize:30, bold:true, color:'FFFFFF', fontFace:'Calibri', valign:'middle' });
        if (sd.subtitle) slide.addText(sd.subtitle, { x:0.25, y:4.85, w:9.5, h:0.5, fontSize:14, color:'FFFFFFCC', fontFace:'Calibri Light', valign:'top' });
        break;
      }

      // ── CHART ──────────────────────────────────────────────────────────────
      case 'chart': {
        slide.background = { color: T.bg };
        hdr(slide, sd.title);
        const chartType = sd.chartType || 'bar'; // bar | line | pie | donut | area
        const chartData = sd.chartData || { labels:['A','B','C'], datasets:[{ name:'Series 1', values:[30,50,70] }] };

        const pptChartType = {
          bar:   pres.ChartType.bar,
          line:  pres.ChartType.line,
          pie:   pres.ChartType.pie,
          donut: pres.ChartType.doughnut,
          area:  pres.ChartType.area,
          bar3d: pres.ChartType.bar3D,
        }[chartType] || pres.ChartType.bar;

        const seriesColors = ['pie','donut'].includes(chartType)
  ? chartData.labels.map((_, li) => T.chartColors[li % T.chartColors.length])
  : chartData.datasets.map((_, di) => T.chartColors[di % T.chartColors.length]);
        const chartDataFormatted = chartData.datasets.map((ds, di) => ({
          name: ds.name,
          labels: chartData.labels,
          values: ds.values,
        }));

        const isDark = ['dark','navy'].includes(theme);
const chartOptions = {
  x: 0.4, y: 0.95, w: 9.2, h: 4.45,
  chartColors: seriesColors,
  showLegend: chartData.datasets.length > 1 || ['pie','donut'].includes(chartType),
  legendPos: 'b',
  legendFontSize: 11,
  legendColor: isDark ? 'FFFFFF' : '1E293B',
  showTitle: false,
  dataLabelColor: isDark ? 'FFFFFF' : '1E293B',
  dataLabelFontSize: 11,
  dataLabelFontBold: true,
  valAxisLineColor: T.border,
  catAxisLineColor: T.border,
  catAxisLabelColor: isDark ? 'FFFFFF' : '1E293B',
  valAxisLabelColor: isDark ? 'FFFFFF' : '1E293B',
  catAxisLabelFontSize: 10,
  valAxisLabelFontSize: 10,
  valGridLine: { color: T.border, style: 'dash', size: 0.5 },
  catGridLine: { color: T.border, style: 'dash', size: 0.5 },
  plotAreaBkgndColor: T.bg,
  chartAreaBkgndColor: T.bg,
  showValue: sd.showValues !== false,
};

        if (['pie','donut'].includes(chartType)) {
  chartOptions.showLabel = true;
  chartOptions.showPercent = true;
  chartOptions.showValue = false;
  chartOptions.showLegend = true;
  chartOptions.legendPos = 'r';
  chartOptions.dataLabelColor = 'FFFFFF';
  chartOptions.dataLabelFontSize = 12;
  chartOptions.dataLabelFontBold = true;
  if (chartType === 'donut') chartOptions.holeSize = 55;
}

        slide.addChart(pptChartType, chartDataFormatted, chartOptions);

        // subtitle under header
        if (sd.subtitle) slide.addText(sd.subtitle, { x:0.45, y:0.83, w:9.1, h:0.25, fontSize:10, color:T.subtext, fontFace:'Calibri' });
        footer(slide);
        break;
      }

      // ── COMPARISON (side-by-side cards) ────────────────────────────────────
      case 'comparison': {
        slide.background = { color: T.bg };
        hdr(slide, sd.title);
        const cols = sd.columns || [];
        const nCols = Math.min(cols.length, 3);
        const colW = nCols > 0 ? (9.2 / nCols) - 0.12 : 9.08;
        cols.slice(0, 3).forEach((col, idx) => {
          const cx = 0.4 + idx * (colW + 0.12);
          const accentCol = T.chartColors[idx % T.chartColors.length];
          card(slide, cx, 0.9, colW, 4.42);
          slide.addShape(pres.shapes.RECTANGLE, { x:cx, y:0.9, w:colW, h:0.1, fill:{color:accentCol}, line:{color:accentCol} });
          slide.addText(col.header||'', { x:cx+0.1, y:1.05, w:colW-0.2, h:0.5, fontSize:15, bold:true, color:accentCol, fontFace:'Calibri', align:'center' });
          if (col.value) slide.addText(col.value, { x:cx+0.1, y:1.6, w:colW-0.2, h:0.55, fontSize:22, bold:true, color:T.text, fontFace:'Calibri', align:'center' });
          const points = col.points || [];
          const pitems = points.map((p,pi) => ({ text:'✓  '+p, options:{breakLine:pi<points.length-1, fontSize:12.5, color:T.text, paraSpaceAfter:8} }));
          if (pitems.length) slide.addText(pitems, { x:cx+0.15, y:col.value?2.2:1.65, w:colW-0.28, h:col.value?2.95:3.5, valign:'top' });
        });
        footer(slide);
        break;
      }

      // ── PROCESS (numbered steps with arrows) ───────────────────────────────
      case 'process': {
        slide.background = { color: T.bg };
        hdr(slide, sd.title);
        const steps2 = sd.steps||[];
        const n3 = Math.min(steps2.length, 5);
        const bw = 9.2 / n3 - 0.1;
        steps2.slice(0,5).forEach((step, idx) => {
          const cx = 0.4 + idx * (bw + 0.1);
          const col = T.chartColors[idx % T.chartColors.length];
          card(slide, cx, 1.0, bw, 3.9);
          slide.addShape(pres.shapes.RECTANGLE, { x:cx, y:1.0, w:bw, h:0.08, fill:{color:col}, line:{color:col} });
          // circle number
          slide.addShape(pres.shapes.OVAL, { x:cx+bw/2-0.38, y:1.2, w:0.76, h:0.76, fill:{color:col,transparency:20}, line:{color:col,pt:2} });
          slide.addText(String(idx+1), { x:cx+bw/2-0.38, y:1.2, w:0.76, h:0.76, fontSize:18, bold:true, color:col, align:'center', valign:'middle' });
          // step label
          const parts = step.split('|');
          slide.addText(parts[0]||step, { x:cx+0.08, y:2.05, w:bw-0.16, h:0.65, fontSize:Math.max(10,13-n3), bold:true, color:T.text, fontFace:'Calibri', align:'center', valign:'middle', wrap:true });
if (parts[1]) slide.addText(parts[1], { x:cx+0.08, y:2.78, w:bw-0.16, h:1.75, fontSize:Math.max(9,11-n3), color:T.subtext, fontFace:'Calibri', align:'center', valign:'top', wrap:true });
          // arrow
          if (idx < n3-1) slide.addShape(pres.shapes.RIGHT_ARROW, { x:cx+bw+0.01, y:2.3, w:0.1, h:0.3, fill:{color:T.border}, line:{color:T.border} });
        });
        footer(slide);
        break;
      }

      // ── DATA-TABLE ─────────────────────────────────────────────────────────
      case 'data-table': {
        slide.background = { color: T.bg };
        hdr(slide, sd.title);
        const rows = sd.tableData||[];
        if (rows.length) {
          slide.addTable(rows, {
            x:0.4, y:0.95, w:9.2,
            colW: Array(rows[0].length).fill(9.2/rows[0].length),
            border: { color:T.border, pt:0.5 },
            fill: T.bgAlt,
            fontFace: 'Calibri',
            fontSize: 12,
            color: T.text,
            align: 'center',
            valign: 'middle',
            rowH: 0.45,
          });
        }
        footer(slide);
        break;
      }

      // ── DEFAULT ────────────────────────────────────────────────────────────
      default: {
        slide.background = { color: T.bg };
        hdr(slide, sd.title);
        const items3 = (sd.body||[]).map((b,j) => ({ text:'◆  '+b, options:{breakLine:j<(sd.body||[]).length-1, fontSize:14.5, color:T.text, fontFace:'Calibri', paraSpaceAfter:10} }));
        if (items3.length) slide.addText(items3, { x:0.45, y:1.05, w:9.1, h:4.3, valign:'top' });
        footer(slide);
      }
    }
  }

  const safeFilename = filename.replace(/[^a-zA-Z0-9_-]/g, '_');
  const outPath = path.join(PUBLIC_DIR, `${safeFilename}.pptx`);
  await pres.writeFile({ fileName: outPath });
try {
  const pptxData = fs.readFileSync(outPath);
  const blobUrl = await saveToBlob(`${safeFilename}.pptx`, pptxData, 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
  return `Presentation ready! Download: ${blobUrl}`;
} catch {
  return `Presentation ready! Download: https://api.heyjarvis.me/view/${safeFilename}.pptx`;
}
}

// ── Excel / Financial Statement Generator ─────────────────────────────────────
async function generateExcel({ title, type, filename, data, assumptions, periods, currency = 'USD', units = 'thousands' }) {
  const openpyxl_code = buildExcelCode({ title, type, filename, data, assumptions, periods, currency, units });
  const result = await executeCode(openpyxl_code, 'python', `Generate Excel: ${title}`);
  if (result.includes('Error') || result.includes('Traceback')) {
    console.log('[EXCEL] Error:', result);
    return `Excel generation failed: ${result.substring(0, 300)}`;
  }
  try {
  const safe = filename.replace(/[^a-zA-Z0-9_-]/g,'_');
  const xlsxData = fs.readFileSync(path.join(PUBLIC_DIR, `${safe}.xlsx`));
  const blobUrl = await saveToBlob(`${safe}.xlsx`, xlsxData, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  return `Excel file ready! Download: ${blobUrl}`;
} catch {
  return `Excel file ready! Download: https://api.heyjarvis.me/view/${filename.replace(/[^a-zA-Z0-9_-]/g,'_')}.xlsx`;
}
}

function buildExcelCode({ title, type, filename, data, assumptions, periods, currency, units }) {
  const safe = filename.replace(/[^a-zA-Z0-9_-]/g,'_');
  const PUBLIC_DIR_ESC = PUBLIC_DIR.replace(/\\/g,'\\\\');
  const periodsJson = JSON.stringify(periods || ['2022','2023','2024E','2025E','2026E']);
  const dataJson = JSON.stringify(data || {});
  const assumptionsJson = JSON.stringify(assumptions || {});

  return `
import sys, os, json
sys.stdout.reconfigure(encoding='utf-8')
from openpyxl import Workbook
from openpyxl.styles import (Font, PatternFill, Alignment, Border, Side, GradientFill)
from openpyxl.utils import get_column_letter
from openpyxl.chart import BarChart, LineChart, PieChart, Reference
from openpyxl.chart.series import DataPoint
from openpyxl.formatting.rule import CellIsRule, ColorScaleRule, DataBarRule
from openpyxl.styles.numbers import FORMAT_PERCENTAGE_00

PUBLIC_DIR = r"${PUBLIC_DIR_ESC}"
TITLE = ${JSON.stringify(title)}
TYPE = ${JSON.stringify(type || 'income_statement')}
PERIODS = json.loads(${JSON.stringify(periodsJson)})
DATA = json.loads(${JSON.stringify(dataJson)})
ASSUMPTIONS = json.loads(${JSON.stringify(assumptionsJson)})
CURRENCY = ${JSON.stringify(currency)}
UNITS = ${JSON.stringify(units)}
FILENAME = "${safe}.xlsx"

wb = Workbook()

# ── Color palette (industry standard) ─────────────────────────────
C_HEADER_BG  = "1D4ED8"   # deep blue header
C_HEADER_FG  = "FFFFFF"
C_SECTION_BG = "EFF6FF"   # light blue section
C_INPUT_FG   = "0000FF"   # blue = hardcoded input
C_FORMULA_FG = "000000"   # black = formula
C_LINK_FG    = "008000"   # green = cross-sheet link
C_TOTAL_BG   = "DBEAFE"   # totals row
C_SUBTOTAL_BG= "F0F9FF"
C_NEG_FG     = "DC2626"   # red = negative / warning
C_ASSUMPTION_BG = "FFFBEB"  # yellow = key assumptions
C_BORDER     = "CBD5E1"

THIN = Side(style='thin', color=C_BORDER)
THICK = Side(style='medium', color='1D4ED8')
NO = Side(style=None)

def hdr_fill(): return PatternFill("solid", fgColor=C_HEADER_BG)
def sec_fill(): return PatternFill("solid", fgColor=C_SECTION_BG)
def total_fill(): return PatternFill("solid", fgColor=C_TOTAL_BG)
def sub_fill(): return PatternFill("solid", fgColor=C_SUBTOTAL_BG)
def assump_fill(): return PatternFill("solid", fgColor=C_ASSUMPTION_BG)

def hdr_font(sz=11): return Font(bold=True, color=C_HEADER_FG, name='Calibri', size=sz)
def sec_font(): return Font(bold=True, color="1D4ED8", name='Calibri', size=10)
def input_font(): return Font(color=C_INPUT_FG, name='Calibri', size=10)
def formula_font(): return Font(color=C_FORMULA_FG, name='Calibri', size=10)
def total_font(): return Font(bold=True, color=C_FORMULA_FG, name='Calibri', size=10)
def label_font(): return Font(name='Calibri', size=10)

def border_all(): return Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
def border_bottom(): return Border(bottom=THIN)
def border_thick_bottom(): return Border(bottom=THICK)

FMT_USD  = '#,##0_);(#,##0);"-"'
FMT_PCT  = '0.0%;(0.0%);"-"'
FMT_MULT = '0.0x'
FMT_INT  = '#,##0'

def num_fmt(ws, row, col_start, col_end, fmt):
    for c in range(col_start, col_end+1):
        ws.cell(row, c).number_format = fmt

def set_col_width(ws, col, w):
    ws.column_dimensions[get_column_letter(col)].width = w

def apply_row_style(ws, row, col_start, col_end, fill=None, font=None, border=None, align=None, fmt=None):
    for c in range(col_start, col_end+1):
        cell = ws.cell(row, c)
        if fill: cell.fill = fill
        if font: cell.font = font
        if border: cell.border = border
        if align: cell.alignment = align
        if fmt: cell.number_format = fmt

def write_header_row(ws, row, labels, col_start=1, fill=True):
    for i, lbl in enumerate(labels):
        cell = ws.cell(row, col_start+i, lbl)
        if fill:
            cell.fill = hdr_fill()
            cell.font = hdr_font()
        cell.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
        cell.border = border_all()

def write_section_header(ws, row, label, col_start, col_end):
    ws.cell(row, col_start, label)
    ws.cell(row, col_start).font = sec_font()
    ws.cell(row, col_start).fill = sec_fill()
    for c in range(col_start, col_end+1):
        ws.cell(row, c).fill = sec_fill()
        ws.cell(row, c).border = border_bottom()
    ws.row_dimensions[row].height = 16

n_periods = len(PERIODS)
DATA_COL_START = 3  # col C
DATA_COL_END   = DATA_COL_START + n_periods - 1

# ══════════════════════════════════════════════════════════════════
# ASSUMPTIONS SHEET
# ══════════════════════════════════════════════════════════════════
ws_a = wb.active
ws_a.title = "Assumptions"
ws_a.sheet_view.showGridLines = False

# Title
ws_a.merge_cells("A1:H1")
ws_a["A1"] = TITLE + " — Key Assumptions"
ws_a["A1"].font = Font(bold=True, size=14, color="FFFFFF", name="Calibri")
ws_a["A1"].fill = hdr_fill()
ws_a["A1"].alignment = Alignment(horizontal="center", vertical="center")
ws_a.row_dimensions[1].height = 28

ws_a["A2"] = f"Currency: {CURRENCY} | Units: {UNITS} | Generated by JARVIS"
ws_a["A2"].font = Font(size=9, color="94A3B8", italic=True, name="Calibri")

ws_a.row_dimensions[2].height = 14

r = 4
ws_a.cell(r, 1, "Assumption").font = hdr_font()
ws_a.cell(r, 1).fill = hdr_fill()
ws_a.cell(r, 1).alignment = Alignment(horizontal="center")

for pi, p in enumerate(PERIODS):
    ws_a.cell(r, 2+pi, p).fill = hdr_fill()
    ws_a.cell(r, 2+pi).font = hdr_font()
    ws_a.cell(r, 2+pi).alignment = Alignment(horizontal="center")

ws_a.column_dimensions["A"].width = 32
for pi in range(n_periods):
    ws_a.column_dimensions[get_column_letter(2+pi)].width = 14

# Default assumptions
default_assumptions = {
    "Revenue Growth Rate": [0.20, 0.18, 0.22, 0.20, 0.18],
    "Gross Margin": [0.65, 0.66, 0.67, 0.68, 0.69],
    "EBITDA Margin": [0.25, 0.27, 0.28, 0.30, 0.31],
    "Tax Rate": [0.21, 0.21, 0.21, 0.21, 0.21],
    "CapEx % Revenue": [0.05, 0.05, 0.04, 0.04, 0.04],
    "D&A % Revenue": [0.03, 0.03, 0.03, 0.03, 0.03],
    "Working Capital % Revenue": [0.08, 0.08, 0.07, 0.07, 0.07],
    "Discount Rate (WACC)": [0.10, 0.10, 0.10, 0.10, 0.10],
    "Terminal Growth Rate": [0.025, 0.025, 0.025, 0.025, 0.025],
    "EV/EBITDA Exit Multiple": [12.0, 12.0, 14.0, 14.0, 15.0],
}
if ASSUMPTIONS:
    default_assumptions.update(ASSUMPTIONS)

assump_rows = {}
for key, vals in default_assumptions.items():
    r += 1
    ws_a.cell(r, 1, key)
    ws_a.cell(r, 1).font = label_font()
    ws_a.cell(r, 1).fill = assump_fill()
    ws_a.cell(r, 1).border = border_all()
    assump_rows[key] = r
    for pi in range(n_periods):
        val = vals[pi] if pi < len(vals) else vals[-1]
        cell = ws_a.cell(r, 2+pi, val)
        cell.font = input_font()
        cell.fill = assump_fill()
        cell.border = border_all()
        cell.alignment = Alignment(horizontal="right")
        if isinstance(val, float) and val < 1:
            cell.number_format = FMT_PCT
        else:
            cell.number_format = FMT_MULT


# ══════════════════════════════════════════════════════════════════
# INCOME STATEMENT
# ══════════════════════════════════════════════════════════════════
ws_i = wb.create_sheet("Income Statement")
ws_i.sheet_view.showGridLines = False

# Title
ws_i.merge_cells(f"A1:{get_column_letter(DATA_COL_END+1)}1")
ws_i["A1"] = TITLE + " — Income Statement"
ws_i["A1"].font = Font(bold=True, size=14, color="FFFFFF", name="Calibri")
ws_i["A1"].fill = hdr_fill()
ws_i["A1"].alignment = Alignment(horizontal="center", vertical="center")
ws_i.row_dimensions[1].height = 28

ws_i.merge_cells(f"A2:{get_column_letter(DATA_COL_END+1)}2")
ws_i["A2"] = f"({CURRENCY} in {UNITS})"
ws_i["A2"].font = Font(size=9, color="94A3B8", italic=True, name="Calibri")

# Column headers
r = 4
ws_i.cell(r, 1, "Line Item").fill = hdr_fill(); ws_i.cell(r, 1).font = hdr_font()
ws_i.cell(r, 2, "Notes").fill = hdr_fill(); ws_i.cell(r, 2).font = hdr_font()
for pi, p in enumerate(PERIODS):
    c = ws_i.cell(r, DATA_COL_START+pi, p)
    c.fill = hdr_fill(); c.font = hdr_font()
    c.alignment = Alignment(horizontal="center")

ws_i.column_dimensions["A"].width = 34
ws_i.column_dimensions["B"].width = 18
for pi in range(n_periods):
    ws_i.column_dimensions[get_column_letter(DATA_COL_START+pi)].width = 14

# ── Revenue section ────────────────────────────────────────────────
r += 1; write_section_header(ws_i, r, "REVENUE", 1, DATA_COL_END)

r += 1; rev_base_r = r
ws_i.cell(r, 1, "  Total Revenue")
ws_i.cell(r, 1).font = label_font()
rev_base_val = (DATA.get("revenue_base") or [100000, 118000, 139000, 167000, 197000])
for pi in range(n_periods):
    cell = ws_i.cell(r, DATA_COL_START+pi)
    cell.value = rev_base_val[pi] if pi < len(rev_base_val) else None
    cell.font = input_font()
    cell.number_format = FMT_USD
    cell.alignment = Alignment(horizontal="right")

r += 1; rev_growth_r = r
ws_i.cell(r, 1, "  YoY Growth")
ws_i.cell(r, 1).font = Font(italic=True, color="94A3B8", name="Calibri", size=10)
ws_i.cell(r, DATA_COL_START).value = "—"
for pi in range(1, n_periods):
    col = get_column_letter(DATA_COL_START+pi)
    prev_col = get_column_letter(DATA_COL_START+pi-1)
    ws_i.cell(r, DATA_COL_START+pi, f"=({col}{rev_base_r}-{prev_col}{rev_base_r})/{prev_col}{rev_base_r}")
    ws_i.cell(r, DATA_COL_START+pi).font = formula_font()
    ws_i.cell(r, DATA_COL_START+pi).number_format = FMT_PCT

# ── COGS / Gross Profit ────────────────────────────────────────────
r += 1; write_section_header(ws_i, r, "COST OF GOODS SOLD", 1, DATA_COL_END)

r += 1; cogs_r = r
ws_i.cell(r, 1, "  Cost of Revenue")
for pi in range(n_periods):
    rev_col = get_column_letter(DATA_COL_START+pi)
    margin_col = get_column_letter(2 + assump_rows.get("Gross Margin", 5) - 4)
    # simple: COGS = Revenue * (1 - Gross Margin)
    ws_i.cell(r, DATA_COL_START+pi, f"={rev_col}{rev_base_r}*(1-Assumptions!{get_column_letter(2+pi)}{assump_rows.get('Gross Margin', 5)})")
    ws_i.cell(r, DATA_COL_START+pi).font = formula_font()
    ws_i.cell(r, DATA_COL_START+pi).number_format = FMT_USD

r += 1; gp_r = r
ws_i.cell(r, 1, "Gross Profit")
ws_i.cell(r, 1).font = total_font()
for pi in range(n_periods):
    rev_col = get_column_letter(DATA_COL_START+pi)
    ws_i.cell(r, DATA_COL_START+pi, f"={rev_col}{rev_base_r}-{rev_col}{cogs_r}")
    ws_i.cell(r, DATA_COL_START+pi).font = total_font()
    ws_i.cell(r, DATA_COL_START+pi).number_format = FMT_USD
apply_row_style(ws_i, r, 1, DATA_COL_END, fill=total_fill(), border=border_all())

r += 1; gp_margin_r = r
ws_i.cell(r, 1, "  Gross Margin %")
ws_i.cell(r, 1).font = Font(italic=True, color="94A3B8", name="Calibri", size=10)
for pi in range(n_periods):
    rev_col = get_column_letter(DATA_COL_START+pi)
    ws_i.cell(r, DATA_COL_START+pi, f"={rev_col}{gp_r}/{rev_col}{rev_base_r}")
    ws_i.cell(r, DATA_COL_START+pi).number_format = FMT_PCT
    ws_i.cell(r, DATA_COL_START+pi).font = formula_font()

# ── OpEx ───────────────────────────────────────────────────────────
r += 1; write_section_header(ws_i, r, "OPERATING EXPENSES", 1, DATA_COL_END)
opex_items = DATA.get("opex_items") or [
    {"name": "Sales & Marketing", "pct_rev": [0.15,0.14,0.13,0.12,0.11]},
    {"name": "Research & Development", "pct_rev": [0.12,0.12,0.11,0.10,0.10]},
    {"name": "General & Administrative", "pct_rev": [0.08,0.07,0.07,0.06,0.06]},
]
opex_rows = []
for item in opex_items:
    r += 1
    opex_rows.append(r)
    ws_i.cell(r, 1, f"  {item['name']}")
    ws_i.cell(r, 1).font = label_font()
    ws_i.cell(r, 2, f"% of revenue")
    ws_i.cell(r, 2).font = Font(italic=True, color="94A3B8", name="Calibri", size=9)
    pcts = item.get("pct_rev", [0.10]*n_periods)
    for pi in range(n_periods):
        rev_col = get_column_letter(DATA_COL_START+pi)
        pct = pcts[pi] if pi < len(pcts) else pcts[-1]
        ws_i.cell(r, DATA_COL_START+pi, f"={rev_col}{rev_base_r}*{pct}")
        ws_i.cell(r, DATA_COL_START+pi).font = formula_font()
        ws_i.cell(r, DATA_COL_START+pi).number_format = FMT_USD

r += 1; total_opex_r = r
ws_i.cell(r, 1, "Total OpEx")
ws_i.cell(r, 1).font = total_font()
for pi in range(n_periods):
    col = get_column_letter(DATA_COL_START+pi)
    rng = "+".join([f"{col}{or_}" for or_ in opex_rows])
    ws_i.cell(r, DATA_COL_START+pi, f"={rng}")
    ws_i.cell(r, DATA_COL_START+pi).font = total_font()
    ws_i.cell(r, DATA_COL_START+pi).number_format = FMT_USD
apply_row_style(ws_i, r, 1, DATA_COL_END, fill=sub_fill(), border=border_all())

# ── EBITDA / EBIT / Net Income ─────────────────────────────────────
r += 1; write_section_header(ws_i, r, "PROFITABILITY", 1, DATA_COL_END)

r += 1; ebitda_r = r
ws_i.cell(r, 1, "EBITDA")
ws_i.cell(r, 1).font = total_font()
for pi in range(n_periods):
    col = get_column_letter(DATA_COL_START+pi)
    ws_i.cell(r, DATA_COL_START+pi, f"={col}{gp_r}-{col}{total_opex_r}")
    ws_i.cell(r, DATA_COL_START+pi).font = total_font()
    ws_i.cell(r, DATA_COL_START+pi).number_format = FMT_USD
apply_row_style(ws_i, r, 1, DATA_COL_END, fill=total_fill(), border=border_all())

r += 1; ebitda_margin_r = r
ws_i.cell(r, 1, "  EBITDA Margin %")
ws_i.cell(r, 1).font = Font(italic=True, color="94A3B8", name="Calibri", size=10)
for pi in range(n_periods):
    col = get_column_letter(DATA_COL_START+pi)
    ws_i.cell(r, DATA_COL_START+pi, f"={col}{ebitda_r}/{col}{rev_base_r}")
    ws_i.cell(r, DATA_COL_START+pi).number_format = FMT_PCT
    ws_i.cell(r, DATA_COL_START+pi).font = formula_font()

r += 1; da_r = r
ws_i.cell(r, 1, "  D&A")
ws_i.cell(r, 1).font = label_font()
for pi in range(n_periods):
    col = get_column_letter(DATA_COL_START+pi)
    ws_i.cell(r, DATA_COL_START+pi, f"=-{col}{rev_base_r}*Assumptions!{get_column_letter(2+pi)}{assump_rows.get('D&A % Revenue', 9)}")
    ws_i.cell(r, DATA_COL_START+pi).font = formula_font()
    ws_i.cell(r, DATA_COL_START+pi).number_format = FMT_USD

r += 1; ebit_r = r
ws_i.cell(r, 1, "EBIT (Operating Income)")
ws_i.cell(r, 1).font = total_font()
for pi in range(n_periods):
    col = get_column_letter(DATA_COL_START+pi)
    ws_i.cell(r, DATA_COL_START+pi, f"={col}{ebitda_r}+{col}{da_r}")
    ws_i.cell(r, DATA_COL_START+pi).font = total_font()
    ws_i.cell(r, DATA_COL_START+pi).number_format = FMT_USD
apply_row_style(ws_i, r, 1, DATA_COL_END, fill=total_fill(), border=border_all())

r += 1; interest_r = r
ws_i.cell(r, 1, "  Interest Expense")
interest_vals = DATA.get("interest", [0]*n_periods)
for pi in range(n_periods):
    v = interest_vals[pi] if pi < len(interest_vals) else 0
    ws_i.cell(r, DATA_COL_START+pi, -abs(v))
    ws_i.cell(r, DATA_COL_START+pi).font = input_font()
    ws_i.cell(r, DATA_COL_START+pi).number_format = FMT_USD

r += 1; pretax_r = r
ws_i.cell(r, 1, "Pre-Tax Income")
ws_i.cell(r, 1).font = total_font()
for pi in range(n_periods):
    col = get_column_letter(DATA_COL_START+pi)
    ws_i.cell(r, DATA_COL_START+pi, f"={col}{ebit_r}+{col}{interest_r}")
    ws_i.cell(r, DATA_COL_START+pi).font = total_font()
    ws_i.cell(r, DATA_COL_START+pi).number_format = FMT_USD
apply_row_style(ws_i, r, 1, DATA_COL_END, fill=sub_fill(), border=border_all())

r += 1; tax_r = r
ws_i.cell(r, 1, "  Income Tax")
for pi in range(n_periods):
    col = get_column_letter(DATA_COL_START+pi)
    ws_i.cell(r, DATA_COL_START+pi, f"=-MAX({col}{pretax_r}*Assumptions!{get_column_letter(2+pi)}{assump_rows.get('Tax Rate', 7)},0)")
    ws_i.cell(r, DATA_COL_START+pi).font = formula_font()
    ws_i.cell(r, DATA_COL_START+pi).number_format = FMT_USD

r += 1; ni_r = r
ws_i.cell(r, 1, "NET INCOME")
ws_i.cell(r, 1).font = Font(bold=True, size=11, color="FFFFFF", name="Calibri")
ws_i.cell(r, 1).fill = hdr_fill()
for pi in range(n_periods):
    col = get_column_letter(DATA_COL_START+pi)
    ws_i.cell(r, DATA_COL_START+pi, f"={col}{pretax_r}+{col}{tax_r}")
    ws_i.cell(r, DATA_COL_START+pi).font = Font(bold=True, color="FFFFFF", name="Calibri", size=11)
    ws_i.cell(r, DATA_COL_START+pi).fill = hdr_fill()
    ws_i.cell(r, DATA_COL_START+pi).number_format = FMT_USD
    ws_i.cell(r, DATA_COL_START+pi).border = border_all()

ws_i.row_dimensions[ni_r].height = 18

# ── Revenue + EBITDA chart ─────────────────────────────────────────
chart_ws = wb.create_sheet("Charts")
chart_ws.sheet_view.showGridLines = False
chart_ws["A1"] = TITLE + " — Financial Charts"
chart_ws["A1"].font = Font(bold=True, size=14, color="FFFFFF", name="Calibri")
chart_ws["A1"].fill = hdr_fill()

# Write chart data
for pi, p in enumerate(PERIODS):
    chart_ws.cell(3, 2+pi, p).font = hdr_font()
chart_ws.cell(4, 1, "Revenue")
chart_ws.cell(5, 1, "EBITDA")
chart_ws.cell(6, 1, "Net Income")

for pi in range(n_periods):
    col_i = get_column_letter(DATA_COL_START+pi)
    chart_ws.cell(4, 2+pi, f"='Income Statement'!{col_i}{rev_base_r}").font = formula_font()
    chart_ws.cell(5, 2+pi, f"='Income Statement'!{col_i}{ebitda_r}").font = formula_font()
    chart_ws.cell(6, 2+pi, f"='Income Statement'!{col_i}{ni_r}").font = formula_font()

# Bar chart
bar = BarChart()
bar.type = "col"; bar.grouping = "clustered"
bar.title = "Revenue & Profitability"; bar.y_axis.title = f"{CURRENCY} ({UNITS})"
bar.x_axis.title = "Period"; bar.style = 10
bar.width = 18; bar.height = 12
cats = Reference(chart_ws, min_col=2, min_row=3, max_col=1+n_periods)
for row_n in [4,5,6]:
    data_ref = Reference(chart_ws, min_col=2, min_row=row_n, max_col=1+n_periods)
    bar.add_data(data_ref)
bar.set_categories(cats)
bar.series[0].title.v = "Revenue"
bar.series[1].title.v = "EBITDA"
if len(bar.series) > 2: bar.series[2].title.v = "Net Income"
chart_ws.add_chart(bar, "A8")

# Line chart (margins)
chart_ws.cell(25, 1, "EBITDA Margin %")
for pi in range(n_periods):
    col_i = get_column_letter(DATA_COL_START+pi)
    chart_ws.cell(25, 2+pi, f"='Income Statement'!{col_i}{ebitda_margin_r}")
    chart_ws.cell(25, 2+pi).number_format = FMT_PCT

line = LineChart()
line.title = "EBITDA Margin Trend"; line.y_axis.title = "Margin %"
line.x_axis.title = "Period"; line.style = 10
line.width = 18; line.height = 10
line_data = Reference(chart_ws, min_col=2, min_row=25, max_col=1+n_periods)
line_cats = Reference(chart_ws, min_col=2, min_row=3, max_col=1+n_periods)
line.add_data(line_data); line.set_categories(line_cats)
line.series[0].title.v = "EBITDA Margin"
chart_ws.add_chart(line, "A37")

# ══════════════════════════════════════════════════════════════════
# BALANCE SHEET
# ══════════════════════════════════════════════════════════════════
ws_b = wb.create_sheet("Balance Sheet")
ws_b.sheet_view.showGridLines = False
ws_b.column_dimensions["A"].width = 34; ws_b.column_dimensions["B"].width = 16
for pi in range(n_periods): ws_b.column_dimensions[get_column_letter(DATA_COL_START+pi)].width = 14

ws_b.merge_cells(f"A1:{get_column_letter(DATA_COL_END+1)}1")
ws_b["A1"] = TITLE + " — Balance Sheet"
ws_b["A1"].font = Font(bold=True, size=14, color="FFFFFF", name="Calibri")
ws_b["A1"].fill = hdr_fill()
ws_b["A1"].alignment = Alignment(horizontal="center", vertical="center")
ws_b.row_dimensions[1].height = 28

r = 4
write_header_row(ws_b, r, ["Line Item","Notes"]+PERIODS)

# Assets
r+=1; write_section_header(ws_b, r, "CURRENT ASSETS", 1, DATA_COL_END)
asset_items = DATA.get("assets") or [
    ("Cash & Equivalents", [45000,52000,68000,84000,101000]),
    ("Accounts Receivable", [28000,33000,40000,48000,56000]),
    ("Inventory", [15000,17000,20000,23000,27000]),
    ("Other Current Assets", [8000,9000,10000,11000,12000]),
]
ca_rows = []
for name, vals in asset_items:
    r += 1; ca_rows.append(r)
    ws_b.cell(r, 1, f"  {name}").font = label_font()
    for pi, v in enumerate(vals[:n_periods]):
        ws_b.cell(r, DATA_COL_START+pi, v).font = input_font()
        ws_b.cell(r, DATA_COL_START+pi).number_format = FMT_USD

r += 1; total_ca_r = r
ws_b.cell(r, 1, "Total Current Assets").font = total_font()
for pi in range(n_periods):
    col = get_column_letter(DATA_COL_START+pi)
    ws_b.cell(r, DATA_COL_START+pi, f"=SUM({col}{ca_rows[0]}:{col}{ca_rows[-1]})").font = total_font()
    ws_b.cell(r, DATA_COL_START+pi).number_format = FMT_USD
apply_row_style(ws_b, r, 1, DATA_COL_END, fill=total_fill(), border=border_all())

r+=1; write_section_header(ws_b, r, "NON-CURRENT ASSETS", 1, DATA_COL_END)
nca_items = DATA.get("nca") or [
    ("Property, Plant & Equipment (net)", [85000,90000,96000,102000,108000]),
    ("Intangible Assets", [22000,20000,18000,16000,14000]),
    ("Goodwill", [35000,35000,35000,35000,35000]),
    ("Other Long-Term Assets", [12000,13000,14000,15000,16000]),
]
nca_rows = []
for name, vals in nca_items:
    r += 1; nca_rows.append(r)
    ws_b.cell(r, 1, f"  {name}").font = label_font()
    for pi, v in enumerate(vals[:n_periods]):
        ws_b.cell(r, DATA_COL_START+pi, v).font = input_font()
        ws_b.cell(r, DATA_COL_START+pi).number_format = FMT_USD

r += 1; total_nca_r = r
ws_b.cell(r, 1, "Total Non-Current Assets").font = total_font()
for pi in range(n_periods):
    col = get_column_letter(DATA_COL_START+pi)
    ws_b.cell(r, DATA_COL_START+pi, f"=SUM({col}{nca_rows[0]}:{col}{nca_rows[-1]})").font = total_font()
    ws_b.cell(r, DATA_COL_START+pi).number_format = FMT_USD
apply_row_style(ws_b, r, 1, DATA_COL_END, fill=sub_fill(), border=border_all())

r += 1; total_assets_r = r
ws_b.cell(r, 1, "TOTAL ASSETS").font = Font(bold=True, size=11, color="FFFFFF", name="Calibri")
ws_b.cell(r, 1).fill = hdr_fill()
for pi in range(n_periods):
    col = get_column_letter(DATA_COL_START+pi)
    ws_b.cell(r, DATA_COL_START+pi, f"={col}{total_ca_r}+{col}{total_nca_r}")
    ws_b.cell(r, DATA_COL_START+pi).font = Font(bold=True, color="FFFFFF", name="Calibri")
    ws_b.cell(r, DATA_COL_START+pi).fill = hdr_fill()
    ws_b.cell(r, DATA_COL_START+pi).number_format = FMT_USD
    ws_b.cell(r, DATA_COL_START+pi).border = border_all()
ws_b.row_dimensions[total_assets_r].height = 18

# Liabilities
r+=1; r+=1; write_section_header(ws_b, r, "CURRENT LIABILITIES", 1, DATA_COL_END)
cl_items = DATA.get("liabilities") or [
    ("Accounts Payable", [18000,21000,25000,29000,34000]),
    ("Short-Term Debt", [10000,10000,8000,8000,6000]),
    ("Accrued Expenses", [14000,16000,19000,22000,26000]),
    ("Deferred Revenue", [8000,9000,11000,13000,15000]),
]
cl_rows = []
for name, vals in cl_items:
    r += 1; cl_rows.append(r)
    ws_b.cell(r, 1, f"  {name}").font = label_font()
    for pi, v in enumerate(vals[:n_periods]):
        ws_b.cell(r, DATA_COL_START+pi, v).font = input_font()
        ws_b.cell(r, DATA_COL_START+pi).number_format = FMT_USD

r += 1; total_cl_r = r
ws_b.cell(r, 1, "Total Current Liabilities").font = total_font()
for pi in range(n_periods):
    col = get_column_letter(DATA_COL_START+pi)
    ws_b.cell(r, DATA_COL_START+pi, f"=SUM({col}{cl_rows[0]}:{col}{cl_rows[-1]})").font = total_font()
    ws_b.cell(r, DATA_COL_START+pi).number_format = FMT_USD
apply_row_style(ws_b, r, 1, DATA_COL_END, fill=total_fill(), border=border_all())

r+=1; write_section_header(ws_b, r, "NON-CURRENT LIABILITIES", 1, DATA_COL_END)
ncl_items = [
    ("Long-Term Debt", DATA.get("ltd") or [80000,75000,70000,60000,50000]),
    ("Deferred Tax Liabilities", [12000,13000,14000,15000,16000]),
]
ncl_rows = []
for name, vals in ncl_items:
    r += 1; ncl_rows.append(r)
    ws_b.cell(r, 1, f"  {name}").font = label_font()
    for pi, v in enumerate(vals[:n_periods]):
        ws_b.cell(r, DATA_COL_START+pi, v).font = input_font()
        ws_b.cell(r, DATA_COL_START+pi).number_format = FMT_USD

r += 1; total_ncl_r = r
ws_b.cell(r, 1, "Total Non-Current Liabilities").font = total_font()
for pi in range(n_periods):
    col = get_column_letter(DATA_COL_START+pi)
    ws_b.cell(r, DATA_COL_START+pi, f"=SUM({col}{ncl_rows[0]}:{col}{ncl_rows[-1]})").font = total_font()
    ws_b.cell(r, DATA_COL_START+pi).number_format = FMT_USD
apply_row_style(ws_b, r, 1, DATA_COL_END, fill=sub_fill(), border=border_all())

r+=1; write_section_header(ws_b, r, "EQUITY", 1, DATA_COL_END)
eq_items = [
    ("Common Stock & APIC", [120000,125000,130000,133000,136000]),
    ("Retained Earnings", [22000,33000,48000,67000,91000]),
    ("Other Comprehensive Income", [-3000,-2000,-1000,0,1000]),
]
eq_rows = []
for name, vals in eq_items:
    r += 1; eq_rows.append(r)
    ws_b.cell(r, 1, f"  {name}").font = label_font()
    for pi, v in enumerate(vals[:n_periods]):
        ws_b.cell(r, DATA_COL_START+pi, v).font = input_font()
        ws_b.cell(r, DATA_COL_START+pi).number_format = FMT_USD

r += 1; total_eq_r = r
ws_b.cell(r, 1, "Total Equity").font = total_font()
for pi in range(n_periods):
    col = get_column_letter(DATA_COL_START+pi)
    ws_b.cell(r, DATA_COL_START+pi, f"=SUM({col}{eq_rows[0]}:{col}{eq_rows[-1]})").font = total_font()
    ws_b.cell(r, DATA_COL_START+pi).number_format = FMT_USD
apply_row_style(ws_b, r, 1, DATA_COL_END, fill=total_fill(), border=border_all())

r += 1; total_le_r = r
ws_b.cell(r, 1, "TOTAL LIABILITIES & EQUITY").font = Font(bold=True, size=11, color="FFFFFF", name="Calibri")
ws_b.cell(r, 1).fill = hdr_fill()
for pi in range(n_periods):
    col = get_column_letter(DATA_COL_START+pi)
    ws_b.cell(r, DATA_COL_START+pi, f"={col}{total_cl_r}+{col}{total_ncl_r}+{col}{total_eq_r}")
    ws_b.cell(r, DATA_COL_START+pi).font = Font(bold=True, color="FFFFFF", name="Calibri")
    ws_b.cell(r, DATA_COL_START+pi).fill = hdr_fill()
    ws_b.cell(r, DATA_COL_START+pi).number_format = FMT_USD
    ws_b.cell(r, DATA_COL_START+pi).border = border_all()
ws_b.row_dimensions[total_le_r].height = 18

# Balance check row
r += 1
ws_b.cell(r, 1, "Balance Check (Assets - L&E)").font = Font(italic=True, color="94A3B8", name="Calibri", size=9)
for pi in range(n_periods):
    col = get_column_letter(DATA_COL_START+pi)
    ws_b.cell(r, DATA_COL_START+pi, f"={col}{total_assets_r}-{col}{total_le_r}")
    ws_b.cell(r, DATA_COL_START+pi).number_format = FMT_USD
    ws_b.cell(r, DATA_COL_START+pi).font = Font(italic=True, color="94A3B8", name="Calibri", size=9)

# ══════════════════════════════════════════════════════════════════
# CASH FLOW STATEMENT
# ══════════════════════════════════════════════════════════════════
ws_c = wb.create_sheet("Cash Flow")
ws_c.sheet_view.showGridLines = False
ws_c.column_dimensions["A"].width = 34; ws_c.column_dimensions["B"].width = 16
for pi in range(n_periods): ws_c.column_dimensions[get_column_letter(DATA_COL_START+pi)].width = 14

ws_c.merge_cells(f"A1:{get_column_letter(DATA_COL_END+1)}1")
ws_c["A1"] = TITLE + " — Cash Flow Statement"
ws_c["A1"].font = Font(bold=True, size=14, color="FFFFFF", name="Calibri")
ws_c["A1"].fill = hdr_fill()
ws_c["A1"].alignment = Alignment(horizontal="center", vertical="center")
ws_c.row_dimensions[1].height = 28

r = 4
write_header_row(ws_c, r, ["Line Item","Notes"]+PERIODS)

r+=1; write_section_header(ws_c, r, "OPERATING ACTIVITIES", 1, DATA_COL_END)
r+=1; cf_ni_r = r
ws_c.cell(r, 1, "  Net Income").font = label_font()
for pi in range(n_periods):
    col_i = get_column_letter(DATA_COL_START+pi)
    ws_c.cell(r, DATA_COL_START+pi, f"='Income Statement'!{col_i}{ni_r}")
    ws_c.cell(r, DATA_COL_START+pi).font = Font(color="008000", name="Calibri", size=10)
    ws_c.cell(r, DATA_COL_START+pi).number_format = FMT_USD

r+=1; cf_da_r = r
ws_c.cell(r, 1, "  Add: D&A").font = label_font()
for pi in range(n_periods):
    col_i = get_column_letter(DATA_COL_START+pi)
    ws_c.cell(r, DATA_COL_START+pi, f"=-'Income Statement'!{col_i}{da_r}")
    ws_c.cell(r, DATA_COL_START+pi).font = Font(color="008000", name="Calibri", size=10)
    ws_c.cell(r, DATA_COL_START+pi).number_format = FMT_USD

r+=1; cf_wc_r = r
ws_c.cell(r, 1, "  Change in Working Capital").font = label_font()
for pi in range(n_periods):
    col_i = get_column_letter(DATA_COL_START+pi)
    ws_c.cell(r, DATA_COL_START+pi, f"=-'Income Statement'!{col_i}{rev_base_r}*Assumptions!{get_column_letter(2+pi)}{assump_rows.get('Working Capital % Revenue', 11)}")
    ws_c.cell(r, DATA_COL_START+pi).font = formula_font()
    ws_c.cell(r, DATA_COL_START+pi).number_format = FMT_USD

r+=1; cf_cfo_r = r
ws_c.cell(r, 1, "Cash from Operations").font = total_font()
for pi in range(n_periods):
    col = get_column_letter(DATA_COL_START+pi)
    ws_c.cell(r, DATA_COL_START+pi, f"={col}{cf_ni_r}+{col}{cf_da_r}+{col}{cf_wc_r}")
    ws_c.cell(r, DATA_COL_START+pi).font = total_font()
    ws_c.cell(r, DATA_COL_START+pi).number_format = FMT_USD
apply_row_style(ws_c, r, 1, DATA_COL_END, fill=total_fill(), border=border_all())

r+=1; r+=1; write_section_header(ws_c, r, "INVESTING ACTIVITIES", 1, DATA_COL_END)
r+=1; cf_capex_r = r
ws_c.cell(r, 1, "  Capital Expenditures").font = label_font()
for pi in range(n_periods):
    col_i = get_column_letter(DATA_COL_START+pi)
    ws_c.cell(r, DATA_COL_START+pi, f"=-'Income Statement'!{col_i}{rev_base_r}*Assumptions!{get_column_letter(2+pi)}{assump_rows.get('CapEx % Revenue', 8)}")
    ws_c.cell(r, DATA_COL_START+pi).font = formula_font()
    ws_c.cell(r, DATA_COL_START+pi).number_format = FMT_USD

r+=1; cf_cfi_r = r
ws_c.cell(r, 1, "Cash from Investing").font = total_font()
for pi in range(n_periods):
    col = get_column_letter(DATA_COL_START+pi)
    ws_c.cell(r, DATA_COL_START+pi, f"={col}{cf_capex_r}")
    ws_c.cell(r, DATA_COL_START+pi).font = total_font()
    ws_c.cell(r, DATA_COL_START+pi).number_format = FMT_USD
apply_row_style(ws_c, r, 1, DATA_COL_END, fill=sub_fill(), border=border_all())

r+=1; r+=1; write_section_header(ws_c, r, "FINANCING ACTIVITIES", 1, DATA_COL_END)
r+=1; cf_debt_r = r
ws_c.cell(r, 1, "  Net Debt Repayment").font = label_font()
debt_vals = DATA.get("debt_change") or [0,-5000,-5000,-10000,-10000]
for pi in range(n_periods):
    ws_c.cell(r, DATA_COL_START+pi, debt_vals[pi] if pi<len(debt_vals) else 0)
    ws_c.cell(r, DATA_COL_START+pi).font = input_font()
    ws_c.cell(r, DATA_COL_START+pi).number_format = FMT_USD

r+=1; cf_div_r = r
ws_c.cell(r, 1, "  Dividends Paid").font = label_font()
div_vals = DATA.get("dividends") or [0,0,0,0,0]
for pi in range(n_periods):
    ws_c.cell(r, DATA_COL_START+pi, div_vals[pi] if pi<len(div_vals) else 0)
    ws_c.cell(r, DATA_COL_START+pi).font = input_font()
    ws_c.cell(r, DATA_COL_START+pi).number_format = FMT_USD

r+=1; cf_cff_r = r
ws_c.cell(r, 1, "Cash from Financing").font = total_font()
for pi in range(n_periods):
    col = get_column_letter(DATA_COL_START+pi)
    ws_c.cell(r, DATA_COL_START+pi, f"={col}{cf_debt_r}+{col}{cf_div_r}")
    ws_c.cell(r, DATA_COL_START+pi).font = total_font()
    ws_c.cell(r, DATA_COL_START+pi).number_format = FMT_USD
apply_row_style(ws_c, r, 1, DATA_COL_END, fill=sub_fill(), border=border_all())

r+=1; r+=1
ws_c.cell(r, 1, "NET CHANGE IN CASH").font = Font(bold=True, size=11, color="FFFFFF", name="Calibri")
ws_c.cell(r, 1).fill = hdr_fill()
for pi in range(n_periods):
    col = get_column_letter(DATA_COL_START+pi)
    ws_c.cell(r, DATA_COL_START+pi, f"={col}{cf_cfo_r}+{col}{cf_cfi_r}+{col}{cf_cff_r}")
    ws_c.cell(r, DATA_COL_START+pi).font = Font(bold=True, color="FFFFFF", name="Calibri")
    ws_c.cell(r, DATA_COL_START+pi).fill = hdr_fill()
    ws_c.cell(r, DATA_COL_START+pi).number_format = FMT_USD
    ws_c.cell(r, DATA_COL_START+pi).border = border_all()
ws_c.row_dimensions[r].height = 18

# ══════════════════════════════════════════════════════════════════
# KPI DASHBOARD SHEET
# ══════════════════════════════════════════════════════════════════
ws_k = wb.create_sheet("KPI Dashboard")
ws_k.sheet_view.showGridLines = False
ws_k.column_dimensions["A"].width = 30; ws_k.column_dimensions["B"].width = 5
for pi in range(n_periods): ws_k.column_dimensions[get_column_letter(3+pi)].width = 14

ws_k.merge_cells(f"A1:{get_column_letter(3+n_periods)}1")
ws_k["A1"] = TITLE + " — KPI Dashboard"
ws_k["A1"].font = Font(bold=True, size=16, color="FFFFFF", name="Calibri")
ws_k["A1"].fill = hdr_fill()
ws_k["A1"].alignment = Alignment(horizontal="center", vertical="center")
ws_k.row_dimensions[1].height = 32

r = 3
for pi, p in enumerate(PERIODS):
    ws_k.cell(r, 3+pi, p).fill = hdr_fill()
    ws_k.cell(r, 3+pi).font = hdr_font()
    ws_k.cell(r, 3+pi).alignment = Alignment(horizontal="center")

kpis = [
    ("REVENUE", f"='Income Statement'!{{col}}{rev_base_r}", FMT_USD, True),
    ("Revenue Growth %", f"='Income Statement'!{{col}}{rev_growth_r}", FMT_PCT, False),
    ("EBITDA", f"='Income Statement'!{{col}}{ebitda_r}", FMT_USD, True),
    ("EBITDA Margin %", f"='Income Statement'!{{col}}{ebitda_margin_r}", FMT_PCT, False),
    ("Net Income", f"='Income Statement'!{{col}}{ni_r}", FMT_USD, True),
    ("Cash from Operations", f"='Cash Flow'!{{col}}{cf_cfo_r}", FMT_USD, False),
    ("Free Cash Flow", f"='Cash Flow'!{{col}}{cf_cfo_r}+'Cash Flow'!{{col}}{cf_capex_r}", FMT_USD, True),
    ("Total Assets", f"='Balance Sheet'!{{col}}{total_assets_r}", FMT_USD, False),
    ("Total Equity", f"='Balance Sheet'!{{col}}{total_eq_r}", FMT_USD, False),
]

for ki, (kpi_name, formula_tmpl, fmt, is_key) in enumerate(kpis):
    r += 1
    ws_k.cell(r, 1, kpi_name)
    if is_key:
        ws_k.cell(r, 1).font = Font(bold=True, name="Calibri", size=10.5)
        apply_row_style(ws_k, r, 1, 2+n_periods, fill=sub_fill())
    else:
        ws_k.cell(r, 1).font = label_font()
    for pi in range(n_periods):
        col_i = get_column_letter(DATA_COL_START+pi)
        formula = formula_tmpl.replace("{col}", col_i)
        ws_k.cell(r, 3+pi, formula)
        ws_k.cell(r, 3+pi).number_format = fmt
        if is_key:
            ws_k.cell(r, 3+pi).font = total_font()
        else:
            ws_k.cell(r, 3+pi).font = formula_font()
        ws_k.cell(r, 3+pi).alignment = Alignment(horizontal="right")
        ws_k.cell(r, 3+pi).fill = sub_fill() if is_key else PatternFill()
    ws_k.row_dimensions[r].height = 15

# Set sheet order
wb.move_sheet("Assumptions", offset=0)

# Freeze panes on all sheets
for ws in wb.worksheets:
    ws.freeze_panes = "C5"

out_path = os.path.join(PUBLIC_DIR, FILENAME)
wb.save(out_path)
print(f"Saved: {out_path}")
`;
}

const { signup, login, verifyToken, loadUserMemory, saveUserMemory, saveConversation, loadConversations, deleteConversation } = require('./auth');
const rateLimit = require('express-rate-limit');

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '500mb' }));
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  validate: { trustProxy: false },
  message: { error: 'Too many requests, slow down.' },
  keyGenerator: (req) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) { const user = verifyToken(token); if (user) return user.userId; }
    return req.ip;
  }
});
app.use('/chat', chatLimiter);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const { neon: memoryNeon } = require('@neondatabase/serverless');
const memorySql = memoryNeon(process.env.DATABASE_URL);
// ============ WEEK 2 MEMORY SYSTEM ============
async function extractAndSaveEntities(userId, conversationText) {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 800,
      messages: [{ role: 'user', content: `Extract entities from this conversation. Respond ONLY with raw JSON, no markdown.\n\nFormat: {"entities":[{"name":"John Smith","type":"person","facts":{"role":"investor","company":"Sequoia"}}],"mood":"stressed","project":"clickflo","project_facts":{"key":"launch_date","value":"June 2025"},"preferences":[{"category":"design","key":"theme","value":"dark"}]}\n\nTypes: person, company, project, investor, product\nProject: clickflo, troy, jarvis, friendsly, sesami, sokr, bookly, or null\nMood: happy, stressed, excited, anxious, neutral, or null\nproject_facts: one key fact about the mentioned project (or null)\npreferences: array of learned preferences from the conversation (or [])\n\nConversation:\n${conversationText.substring(0, 3000)}` }]
    });
    let text = response.content[0].text.replace(/```json|```/g, '').trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return;
    const data = JSON.parse(match[0]);

    for (const entity of (data.entities || [])) {
      if (!entity.name || !entity.type) continue;
      const existing = await memorySql`SELECT id, profile, mention_count FROM entities WHERE user_id = ${userId} AND LOWER(name) = LOWER(${entity.name}) LIMIT 1`;
      if (existing.length > 0) {
        const merged = { ...existing[0].profile, ...entity.facts };
        await memorySql`UPDATE entities SET profile = ${JSON.stringify(merged)}, mention_count = ${existing[0].mention_count + 1}, last_mentioned = NOW() WHERE id = ${existing[0].id}`;
      } else {
        await memorySql`INSERT INTO entities (user_id, name, type, profile) VALUES (${userId}, ${entity.name}, ${entity.type}, ${JSON.stringify(entity.facts || {})})`;
      }
    }

    if (data.mood) {
      await memorySql`INSERT INTO emotional_log (user_id, mood, context) VALUES (${userId}, ${data.mood}, ${conversationText.substring(0, 500)})`;
    }

    if (data.project) {
      const key = 'last_discussed';
      const value = new Date().toISOString();
      await memorySql`INSERT INTO project_memories (user_id, project, key, value) VALUES (${userId}, ${data.project}, ${key}, ${value}) ON CONFLICT (user_id, project, key) DO UPDATE SET value = ${value}, updated_at = NOW()`;
      
      if (data.project_facts?.key && data.project_facts?.value) {
        await memorySql`INSERT INTO project_memories (user_id, project, key, value) VALUES (${userId}, ${data.project}, ${data.project_facts.key}, ${data.project_facts.value}) ON CONFLICT (user_id, project, key) DO UPDATE SET value = ${data.project_facts.value}, updated_at = NOW()`;
      }
    }

    for (const pref of (data.preferences || [])) {
      if (!pref.category || !pref.key || !pref.value) continue;
      await memorySql`INSERT INTO user_preferences (user_id, category, key, value) VALUES (${userId}, ${pref.category}, ${pref.key}, ${pref.value}) ON CONFLICT (user_id, category, key) DO UPDATE SET value = ${pref.value}, confidence = 1.0, updated_at = NOW()`;
    }
  } catch (e) { console.log('[ENTITIES] Error:', e.message); }
}




async function semanticSearch(userId, query) {
  try {
    const rows = await memorySql`SELECT summary, created_at FROM conversation_summaries WHERE user_id = ${userId} AND summary ILIKE ${'%' + query.split(' ').join('%') + '%'} ORDER BY created_at DESC LIMIT 5`;
    return rows.map(r => r.summary).join('\n\n');
  } catch (e) { return ''; }
}

async function loadEnrichedMemory(userId) {
  try {
    const [entities, projects, moods, prefs] = await Promise.all([
      memorySql`SELECT name, type, profile, mention_count, last_mentioned FROM entities WHERE user_id = ${userId} ORDER BY mention_count DESC LIMIT 20`,
      memorySql`SELECT project, key, value FROM project_memories WHERE user_id = ${userId} ORDER BY updated_at DESC LIMIT 30`,
      memorySql`SELECT mood, context, created_at FROM emotional_log WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 10`,
      memorySql`SELECT category, key, value FROM user_preferences WHERE user_id = ${userId} ORDER BY updated_at DESC LIMIT 20`,
    ]);
    return { entities, projects, moods, prefs };
  } catch (e) { return { entities: [], projects: [], moods: [], prefs: [] }; }
}
async function logApiUsage(userId, service, model, inputTokens, outputTokens, ttsChars, endpoint) {
  try {
    const pricing = {
      'claude-opus-4-5':    { in: 15.00, out: 75.00 },
      'claude-sonnet-4-6':  { in: 3.00,  out: 15.00 },
      'claude-haiku-4-5-20251001': { in: 0.80, out: 4.00 },
    };
    let cost = 0;
    if (service === 'anthropic' && pricing[model]) {
      cost = (inputTokens / 1_000_000) * pricing[model].in + (outputTokens / 1_000_000) * pricing[model].out;
    } else if (service === 'elevenlabs') {
      cost = (ttsChars / 1000) * 0.18;
    }
    await memorySql`
      INSERT INTO api_usage (user_id, service, model, input_tokens, output_tokens, tts_chars, cost_usd, endpoint)
      VALUES (${userId}, ${service}, ${model || ''}, ${inputTokens || 0}, ${outputTokens || 0}, ${ttsChars || 0}, ${cost}, ${endpoint || ''})
    `;
  } catch (e) { console.log('[USAGE] Log error:', e.message); }
}
async function saveConversationSummary(userId, conversationHistory) {
  if (!conversationHistory || conversationHistory.length < 2) return;
  try {
    const messages = conversationHistory.slice(-10).map(m =>
      `${m.role}: ${typeof m.content === 'string' ? m.content : m.content.find(b => b.type === 'text')?.text || ''}`
    ).join('\n');
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 300,
      messages: [{ role: 'user', content: `Summarize this conversation in 2-3 sentences, focusing on what was learned about the user and what was accomplished:\n\n${messages}` }]
    });
    const summary = response.content[0].text;
    await memorySql`INSERT INTO conversation_summaries (user_id, summary) VALUES (${userId}, ${summary})`;
    console.log(`[MEMORY] Saved summary for ${userId}`);
  } catch (e) { console.log('[MEMORY] Error:', e.message); }
}

async function loadMemorySummaries(userId) {
  try {
    const rows = await memorySql`SELECT summary FROM conversation_summaries WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 5`;
    return rows.map(r => r.summary).join('\n\n');
  } catch (e) { return ''; }
}
const NADAV_USER_ID = 'nadavminkowitz_gmail_com';
const UNLIMITED_USERS = new Set(['nlmwtpu_gmail_com', 'nadavminkowitz_gmail_com']);
const FAMILY_USERS = new Set([
  'cminkowitz32_posnackstudent_org',
  'gminkowitz31_posnackstudent_org',
  'danielmink_gmail_com',
  'dm_minkholdings_com',
  'shimonredd09_gmail_com',
  'admin_prufli_com',
  'arielomer1013_gmail_com',
  'will_philipstein_com',
  'rina_philipstein_com',
  'llevym1980_gmail_com',
  'lmink80_gmail_com',
  'juliomoraes_live_com',
]);
const FAMILY_DAILY_MSG_LIMIT = 25;
const FREE_DAILY_COST_CAP = 0.75;
const FREE_LIMIT = 20; // kept for family message cap
process.env.TWILIO_PHONE_NUMBER = '+15054776732';
// ============ STATE ============
const PROACTIVE_LOG_FILE = path.join(__dirname, 'proactive_log.json');
const MODEL_CACHE_DIR = path.join(__dirname, 'model_cache');
const PUBLIC_DIR = path.join(__dirname, 'public');
const { put } = require('@vercel/blob');

async function saveToBlob(filename, data, contentType = 'application/octet-stream') {
  try {
    const { url } = await put(filename, data, {
      access: 'public',
      contentType,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    console.log(`[BLOB] Saved: ${url}`);
    // Also save locally as fallback
    try { fs.writeFileSync(path.join(PUBLIC_DIR, filename), data); } catch {}
    return url;
  } catch (e) {
    console.log('[BLOB] Failed, using local:', e.message);
    fs.writeFileSync(path.join(PUBLIC_DIR, filename), data);
    return `https://api.heyjarvis.me/view/${filename}`;
  }
}
if (!fs.existsSync(MODEL_CACHE_DIR)) fs.mkdirSync(MODEL_CACHE_DIR);
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR);

// Per-user proactive updates
const userProactiveUpdates = {};
const userProactiveLogFiles = {};

function getProactiveLogFile(userId) {
  return path.join(__dirname, `proactive_log_${userId}.json`);
}

function loadProactiveUpdates(userId) {
  try {
    const file = getProactiveLogFile(userId);
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')).updates || [];
  } catch (e) {}
  // Fallback: load global log for Nadav
  if (userId === NADAV_USER_ID) {
    try {
      if (fs.existsSync(PROACTIVE_LOG_FILE)) return JSON.parse(fs.readFileSync(PROACTIVE_LOG_FILE, 'utf8')).updates || [];
    } catch (e) {}
  }
  return [];
}

function saveProactiveUpdates(userId, updates) {
  try {
    fs.writeFileSync(getProactiveLogFile(userId), JSON.stringify({ updates }, null, 2));
  } catch (e) {}
}

function getUserProactiveUpdates(userId) {
  if (!userProactiveUpdates[userId]) {
    userProactiveUpdates[userId] = loadProactiveUpdates(userId);
  }
  return userProactiveUpdates[userId];
}

function addProactiveUpdate(message, userId = null) {
  const update = { id: Date.now(), message, time: new Date().toLocaleTimeString(), date: new Date().toLocaleDateString(), read: false };

  if (userId) {
    if (!userProactiveUpdates[userId]) userProactiveUpdates[userId] = loadProactiveUpdates(userId);
    userProactiveUpdates[userId].unshift(update);
    if (userProactiveUpdates[userId].length > 100) userProactiveUpdates[userId] = userProactiveUpdates[userId].slice(0, 100);
    saveProactiveUpdates(userId, userProactiveUpdates[userId]);
  } else {
    // Broadcast to all active sessions (for system-level events)
    for (const uid of Object.keys(sessions)) {
      if (!userProactiveUpdates[uid]) userProactiveUpdates[uid] = loadProactiveUpdates(uid);
      userProactiveUpdates[uid].unshift(update);
      if (userProactiveUpdates[uid].length > 100) userProactiveUpdates[uid] = userProactiveUpdates[uid].slice(0, 100);
      saveProactiveUpdates(uid, userProactiveUpdates[uid]);
    }
  }
  console.log(`[PROACTIVE${userId ? ' ' + userId : ''}] ${message}`);
}

const sessions = {};
function getSession(userId) {
  if (!sessions[userId]) {
    sessions[userId] = { conversationHistory: [], userMemory: loadUserMemory(userId) };
  }
  return sessions[userId];
}

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });
  const user = verifyToken(token);
  if (!user) return res.status(401).json({ error: 'Invalid token' });
  req.user = user;
  next();
}

let voiceStatus = { listening: false, speaking: false, transcript: '', response: '' };
let latestScreenshot = null;

// Per-user camera frames
const userCameraFrames = {};
let visionLoopActive = false;
let visionObservations = [];

// ============ FACE RECOGNITION STATE (Nadav-only, PC-local) ============
let faceStatus = {
  present: false, name: null, emotion: null, tone: 'normal',
  lastSeen: null, lastGreeting: null
};
let pendingGreeting = null;
let pendingEmotionTone = null;

// Background response queue (per-user)
const bgResponses = {};
function queueBgResponse(userId, message) {
  if (!bgResponses[userId]) bgResponses[userId] = [];
  bgResponses[userId].push({ message, timestamp: Date.now() });
}
const bgSpokenQueue = [];
const bgSpokenSeen = new Set();

app.get('/bg-spoken', (req, res) => {
  const msg = bgSpokenQueue.shift() || null;
  res.json({ message: msg });
});

// Per-user spoken update tracking
const userSpokenUpdateIds = {};

// ============ CONTINUOUS VISION LOOP (Nadav-only) ============
async function captureScreen() {
  try {
    const buf = await screenshot({ format: 'png' });
    latestScreenshot = buf.toString('base64');
    return latestScreenshot;
  } catch (e) { return null; }
}

async function runVisionLoop() {
  if (visionLoopActive) return;
  visionLoopActive = true;
  console.log('[VISION] Continuous vision loop started');

  while (visionLoopActive) {
    try {
      const screen = await captureScreen();
      if (!screen) { await new Promise(r => setTimeout(r, 5000)); continue; }

      const now = Date.now();
      if (!runVisionLoop._lastAnalysis || now - runVisionLoop._lastAnalysis > 120000) {
        runVisionLoop._lastAnalysis = now;

        // Vision loop only runs for Nadav (local PC user)
        if (!sessions[NADAV_USER_ID]) { await new Promise(r => setTimeout(r, 10000)); continue; }
        const { userMemory } = sessions[NADAV_USER_ID];
        const latestCameraFrame = userCameraFrames[NADAV_USER_ID];

        const visionContent = [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: screen } }
        ];
        if (latestCameraFrame) {
          visionContent.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: latestCameraFrame } });
        }
        visionContent.push({
          type: 'text',
          text: `You are JARVIS's vision system. Analyze this screen${latestCameraFrame ? ' and camera feed' : ''}.
User: ${userMemory.userName || 'Nadav'}. Time: ${new Date().toLocaleString()}.
Face status: ${faceStatus.present ? `${faceStatus.name} detected, emotion: ${faceStatus.emotion || 'unknown'}` : 'No one detected'}.
Previous: ${visionObservations.slice(-3).join('; ')}

Only flag something if genuinely important RIGHT NOW.
If nothing important: respond exactly "NOTHING"
If important: one sentence starting with "JARVIS:" describing what you see.`
        });

        const response = await anthropic.messages.create({
          model: 'claude-opus-4-5',
          max_tokens: 150,
          messages: [{ role: 'user', content: visionContent }]
        });

        const observation = response.content[0]?.text?.trim();
        if (observation && observation !== 'NOTHING' && observation.startsWith('JARVIS:')) {
          visionObservations.push(observation);
          if (visionObservations.length > 20) visionObservations = visionObservations.slice(-20);
          const msg = observation.replace('JARVIS:', '').trim();
          addProactiveUpdate(msg, NADAV_USER_ID);
        }
      }
    } catch (e) {
      console.log('[VISION] Error:', e.message);
    }
    await new Promise(r => setTimeout(r, 10000));
  }
}

// ============ CODE EXECUTION ============
async function executeCode(code, language = 'node', description = '') {
  console.log(`[CODE] ${language}: ${description}`);
  const ext = language === 'python' ? 'py' : language === 'powershell' ? 'ps1' : language === 'bash' ? 'sh' : 'js';
  const tmpFile = path.join(__dirname, `temp_${Date.now()}.${ext}`);

  let finalCode = code;
  if (language === 'node') {
    finalCode = `process.chdir('${__dirname.replace(/\\/g, '/')}');\nconst __workdir = '${__dirname.replace(/\\/g, '/')}';\n` + code;
  }
  fs.writeFileSync(tmpFile, finalCode, 'utf8');

  try {
    let cmd;
    if (language === 'python') cmd = `python3 -X utf8 "${tmpFile}"`;
    else if (language === 'powershell') cmd = `powershell -ExecutionPolicy Bypass -File "${tmpFile}"`;
    else if (language === 'bash') cmd = `bash "${tmpFile}"`;
    else cmd = `node --no-experimental-detect-module "${tmpFile}"`;

    const result = execSync(cmd, { timeout: 60000, cwd: __dirname }).toString();
    try { fs.unlinkSync(tmpFile); } catch {}
    return result.substring(0, 8000);
  } catch (e) {
    try { fs.unlinkSync(tmpFile); } catch {}
    const err = (e.stderr?.toString() || e.message || '').substring(0, 2000);

    const nodeMatch = err.match(/Cannot find module '([^']+)'/);
    const pyMatch = err.match(/No module named '([^']+)'/);

    if (nodeMatch) {
      try {
        execSync(`cd "${__dirname}" && npm install ${nodeMatch[1]}`, { timeout: 60000 });
        return await executeCode(code, language, description);
      } catch (e2) { return `Error after npm install: ${e2.message}`; }
    }
    if (pyMatch) {
      try {
        execSync(`pip install ${pyMatch[1]} --break-system-packages`, { timeout: 60000 });
        return await executeCode(code, language, description);
      } catch (e2) { return `Error after pip install: ${e2.message}`; }
    }
    return `Error: ${err}`;
  }
}

// ============ WEB TOOLS ============
async function webSearch(query) {
  try {
    const res = await axios.get('https://api.search.brave.com/res/v1/web/search', {
      headers: { 'Accept': 'application/json', 'Accept-Encoding': 'gzip', 'X-Subscription-Token': process.env.BRAVE_SEARCH_API_KEY },
      params: { q: query, count: 5 }
    });
    return (res.data.web?.results || []).map(r => ({ title: r.title, url: r.url, description: r.description }));
  } catch (e) { return []; }
}

async function browseUrl(url) {
  try {
    const res = await axios.get(url, { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    const $ = cheerio.load(res.data);
    $('script, style, nav, footer, header').remove();
    return $('body').text().replace(/\s+/g, ' ').trim().substring(0, 6000);
  } catch (e) { return `Could not browse ${url}: ${e.message}`; }
}

// ============ FILE OPERATIONS ============
async function readFile(filePath, action, query) {
  try {
    if (action === 'list') {
      const files = fs.readdirSync(filePath);
      return JSON.stringify(files.slice(0, 100));
    }
    if (action === 'search') {
      const result = execSync(
        `powershell -command "Get-ChildItem -Path 'C:/Users/nadav' -Recurse -Filter '*${query}*' -ErrorAction SilentlyContinue | Select-Object -First 20 FullName | ConvertTo-Json"`,
        { timeout: 15000 }
      ).toString();
      return result || 'No files found';
    }
    if (filePath.toLowerCase().endsWith('.pdf')) {
      const result = await executeCode(
        `import sys\nsys.stdout.reconfigure(encoding='utf-8')\ntry:\n    import pypdf\n    reader = pypdf.PdfReader(r"${filePath.replace(/\\/g, '/')}")\n    text = '\\n'.join(page.extract_text() or '' for page in reader.pages)\n    print(text[:6000])\nexcept Exception as e:\n    print(f"PDF error: {e}")`,
        'python', 'Read PDF'
      );
      return result;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    return content.substring(0, 6000);
  } catch (e) {
    return `File error: ${e.message}`;
  }
}

// ============ 3D MODEL SEARCH ============
async function search3DModels(query, source = 'both') {
  const results = [];
  if (source === 'thingiverse' || source === 'both') {
    try {
      const res = await axios.get('https://api.thingiverse.com/search/' + encodeURIComponent(query), {
        headers: { Authorization: `Bearer ${process.env.THINGIVERSE_API_KEY}` },
        params: { per_page: 5, sort: 'popular' }
      });
      (res.data.hits || []).forEach(item => results.push({ source: 'Thingiverse', name: item.name, url: item.public_url, thumbnail: item.thumbnail, likes: item.like_count, downloads: item.download_count }));
    } catch (e) { results.push({ source: 'Thingiverse', note: 'Browse: https://www.thingiverse.com/search?q=' + encodeURIComponent(query) }); }
  }
  if (source === 'printables' || source === 'both') {
    try {
      const res = await axios.post('https://api.printables.com/graphql/', {
        query: `query SearchPrint($query: String!) { searchPrint(query: $query, first: 5, ordering: "-download_count") { items { id name slug summary downloadCount likeCount image { filePath } } } }`,
        variables: { query }
      }, { headers: { 'Content-Type': 'application/json' } });
      (res.data?.data?.searchPrint?.items || []).forEach(item => results.push({
        source: 'Printables', name: item.name,
        url: `https://www.printables.com/model/${item.id}-${item.slug}`,
        downloads: item.downloadCount,
        thumbnail: item.image?.filePath ? `https://media.printables.com/${item.image.filePath}` : null
      }));
    } catch (e) {}
  }
  return results;
}
async function generateImage(prompt) {
  const enhancedPrompt = `${prompt}, photorealistic, ultra detailed, 8k, sharp focus, professional photography, natural lighting, hyper realistic`;

  const response = await axios.post(
    'https://api.replicate.com/v1/models/black-forest-labs/flux-dev/predictions',
    { input: { prompt: enhancedPrompt, num_outputs: 1, output_format: 'webp', output_quality: 90, num_inference_steps: 28 } },
    { headers: { Authorization: `Token ${process.env.REPLICATE_API_KEY}`, 'Content-Type': 'application/json' } }
  );

  let prediction = response.data;
  while (prediction.status !== 'succeeded' && prediction.status !== 'failed') {
    await new Promise(r => setTimeout(r, 1000));
    const poll = await axios.get(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
      headers: { Authorization: `Token ${process.env.REPLICATE_API_KEY}` }
    });
    prediction = poll.data;
  }

  if (prediction.status === 'failed') throw new Error('Image generation failed');

  const imageUrl = prediction.output[0];
  const filename = `img_${Date.now()}.webp`;
  const imgRes = await axios.get(imageUrl, { responseType: 'arraybuffer' });
const url = await saveToBlob(filename, Buffer.from(imgRes.data), 'image/webp');
return url;
}

async function generateImageWithFace(faceImageBase64, prompt) {
  const response = await axios.post(
    'https://api.replicate.com/v1/models/tencentarc/photomaker/predictions',
    {
      input: {
  prompt: `${prompt}, img, best quality, high quality`,
  input_images: [`data:image/jpeg;base64,${faceImageBase64}`],
  style_name: 'Photographic (Default)',
  num_steps: 25,
  style_strength_ratio: 35,
  num_outputs: 1,
  guidance_scale: 5,
  negative_prompt: 'nsfw, lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry',
}
    },
    { headers: { Authorization: `Token ${process.env.REPLICATE_API_KEY}`, 'Content-Type': 'application/json' } }
  );

  let prediction = response.data;
  while (prediction.status !== 'succeeded' && prediction.status !== 'failed') {
    await new Promise(r => setTimeout(r, 1500));
    const poll = await axios.get(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
      headers: { Authorization: `Token ${process.env.REPLICATE_API_KEY}` }
    });
    prediction = poll.data;
  }

  if (prediction.status === 'failed') throw new Error('Face image generation failed: ' + prediction.error);

  const imageUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
  const filename = `img_${Date.now()}.webp`;
  const imgRes = await axios.get(imageUrl, { responseType: 'arraybuffer' });
return await saveToBlob(filename, Buffer.from(imgRes.data), 'image/webp');
}
async function generateVideo(prompt, durationSeconds = 5) {
  const { fal } = require('@fal-ai/client');
  fal.config({ credentials: process.env.FAL_API_KEY });

  const enhancedPrompt = `${prompt}. All text and speech in English only. Professional English voiceover.`;

  const result = await fal.subscribe('bytedance/seedance-2.0/fast/text-to-video', {
    input: {
      prompt: enhancedPrompt,
      duration: durationSeconds <= 5 ? '5' : '10',
      resolution: '720p',
      aspect_ratio: '16:9',
      generate_audio: true,
      negative_prompt: 'non-english speech, foreign language, gibberish, mumbling',
    },
    pollInterval: 3000,
    onQueueUpdate: (update) => {
      console.log('[VIDEO] status:', update.status);
    },
  });

  const videoUrl = result.data.video.url;
  const filename = `vid_${Date.now()}.mp4`;
  const vidRes = await axios.get(videoUrl, { responseType: 'arraybuffer' });
return await saveToBlob(filename, Buffer.from(vidRes.data), 'video/mp4');
}

async function generateVideoFromImage(imageBase64, imageType, prompt, durationSeconds = 5) {
  const { fal } = require('@fal-ai/client');
  fal.config({ credentials: process.env.FAL_API_KEY });

  // Upload image to fal storage first
  const imageBuffer = Buffer.from(imageBase64, 'base64');
  const imageUrl = await fal.storage.upload(
    new Blob([imageBuffer], { type: imageType }),
    { filename: 'reference.jpg' }
  );

  const enhancedPrompt = `${prompt}. All text and speech in English only. Professional English voiceover.`;

  const result = await fal.subscribe('bytedance/seedance-2.0/fast/image-to-video', {
    input: {
      prompt: enhancedPrompt,
      image_url: imageUrl,
      duration: durationSeconds <= 5 ? '5' : '10',
      resolution: '720p',
      aspect_ratio: '16:9',
      generate_audio: true,
    },
    pollInterval: 3000,
    onQueueUpdate: (update) => {
      console.log('[VIDEO IMG] status:', update.status);
    },
  });

  const videoUrl = result.data.video.url;
  const filename = `vid_${Date.now()}.mp4`;
  const vidRes = await axios.get(videoUrl, { responseType: 'arraybuffer' });
  return await saveToBlob(filename, Buffer.from(vidRes.data), 'video/mp4');
}

async function editVideo(instructions, videoFiles) {
  const tempDir = path.join(__dirname, 'tmp_videos');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

  const inputPaths = videoFiles.map((f, i) => {
    const ext = f.type.includes('mp4') ? 'mp4' : f.type.includes('mov') ? 'mov' : f.type.includes('webm') ? 'webm' : 'mp4';
    const p = path.join(tempDir, `input_${Date.now()}_${i}.${ext}`);
    fs.writeFileSync(p, Buffer.from(f.data, 'base64'));
    return p;
  });



  
  const outputFilename = `vid_${Date.now()}.mp4`;
  const outputPath = path.join(PUBLIC_DIR, outputFilename);
  const lower = instructions.toLowerCase();
  const ffmpeg = require('fluent-ffmpeg');
  const ffmpegPath = require('ffmpeg-static');
  ffmpeg.setFfmpegPath(ffmpegPath);

  if (inputPaths.length === 1) {
    await new Promise((resolve, reject) => {
      let cmd = ffmpeg(inputPaths[0]);
      const vFilters = [];
      const aFilters = [];
      if (lower.includes('color') || lower.includes('grade') || lower.includes('cinematic')) vFilters.push('eq=contrast=1.1:brightness=0.02:saturation=1.2');
      if (lower.includes('black and white') || lower.includes('grayscale')) vFilters.push('hue=s=0');
      if (lower.includes('slow') || lower.includes('slow motion')) { vFilters.push('setpts=2.0*PTS'); aFilters.push('atempo=0.5'); }
      if (lower.includes('speed up') || lower.includes('fast')) { vFilters.push('setpts=0.5*PTS'); aFilters.push('atempo=2.0'); }
      if (vFilters.length) cmd = cmd.videoFilters(vFilters.join(','));
      if (aFilters.length) cmd = cmd.audioFilters(aFilters.join(','));
      cmd.outputOptions(['-c:v libx264', '-preset fast', '-crf 23', '-c:a aac', '-movflags +faststart'])
        .output(outputPath).on('end', resolve).on('error', reject).run();
    });
  } else {
    // Normalize each video first
    const normalizedPaths = [];
    for (let i = 0; i < inputPaths.length; i++) {
      const normPath = path.join(tempDir, `norm_${Date.now()}_${i}.mp4`);
      normalizedPaths.push(normPath);
      await new Promise((res, rej) => {
  ffmpeg(inputPaths[i])
    .outputOptions(['-c:v libx264', '-preset fast', '-crf 23', '-c:a aac', '-ar 44100', '-vf scale=1280:720', '-r 30'])
    .output(normPath)
    .on('end', () => { console.log(`[VIDEO EDIT] Normalized video ${i}`); res(); })
    .on('error', (err) => { console.log(`[VIDEO EDIT] Normalize error video ${i}:`, err.message); rej(err); })
    .on('stderr', (line) => console.log(`[VIDEO EDIT] ffmpeg:`, line))
    .run();
});
    }
    // Concat normalized videos
    const listFile = path.join(tempDir, `list_${Date.now()}.txt`);
    fs.writeFileSync(listFile, normalizedPaths.map(p => `file '${p}'`).join('\n'));
    await new Promise((resolve, reject) => {
  ffmpeg()
    .input(listFile)
    .inputOptions(['-f concat', '-safe 0'])
    .outputOptions(['-c copy'])
    .output(outputPath)
    .on('end', () => { 
      console.log('[VIDEO EDIT] Concat complete:', outputPath);
      normalizedPaths.forEach(p => { try { fs.unlinkSync(p); } catch {} }); 
      resolve(); 
    })
    .on('error', (err) => { console.log('[VIDEO EDIT] Concat error:', err.message); reject(err); })
    .on('stderr', (line) => console.log('[VIDEO EDIT] concat ffmpeg:', line))
    .run();
});
  }

  inputPaths.forEach(p => { try { fs.unlinkSync(p); } catch {} });
const editedData = fs.readFileSync(outputPath);
const blobUrl = await saveToBlob(outputFilename, editedData, 'video/mp4');
return blobUrl;
}

async function screenshotPage(url) {
  try {
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'], headless: 'new' });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 12000 });
    await new Promise(r => setTimeout(r, 2000));
    const filename = `shop_${Date.now()}.png`;
    const outPath = path.join(PUBLIC_DIR, filename);
    await page.screenshot({ path: outPath, fullPage: false });
    await browser.close();
    return `https://api.heyjarvis.me/view/${filename}`;
  } catch (e) {
    console.log('[SCREENSHOT] Failed:', e.message);
    return null;
  }
}
async function shopSearch(query, category, location = '') {
  const results = [];

  if (category === 'product') {
    // Amazon
    try {
      const amazonSearch = await webSearch(`${query} site:amazon.com buy`);
      const amazonResult = amazonSearch.find(r => r.url.includes('amazon.com/') && r.url.includes('/dp/'));
      if (amazonResult) {
        results.push({
          store: 'Amazon',
          name: amazonResult.title.replace(' - Amazon.com', '').replace(' | Amazon.com', ''),
          url: amazonResult.url,
          note: 'Prime eligible — fast shipping',
          color: '#FF9900',
          logo: 'amazon'
        });
      }
    } catch (e) {}

    // eBay
    try {
      const ebaySearch = await webSearch(`${query} site:ebay.com buy it now`);
      const ebayResult = ebaySearch.find(r => r.url.includes('ebay.com/itm/'));
      if (ebayResult) {
        // Try to extract price from description
        const priceMatch = ebayResult.description?.match(/\$[\d,]+\.?\d*/);
        results.push({
          store: 'eBay',
          name: ebayResult.title.replace(' | eBay', ''),
          url: ebayResult.url,
          price: priceMatch ? priceMatch[0] : null,
          note: 'Buy It Now',
          color: '#86B817',
          logo: 'ebay'
        });
      }
    } catch (e) {}
  }

  if (category === 'grocery') {
    try {
      const instacartSearch = await webSearch(`${query} site:instacart.com`);
      const instacartResult = instacartSearch.find(r => r.url.includes('instacart.com'));
      if (instacartResult) {
        results.push({
          store: 'Instacart',
          name: instacartResult.title.replace(' - Instacart', ''),
          url: instacartResult.url || `https://www.instacart.com/store/s?k=${encodeURIComponent(query)}`,
          note: 'Delivery in ~1 hour',
          color: '#43B02A',
          logo: 'instacart'
        });
      } else {
        results.push({
          store: 'Instacart',
          name: query,
          url: `https://www.instacart.com/store/s?k=${encodeURIComponent(query)}`,
          note: 'Search on Instacart',
          color: '#43B02A',
          logo: 'instacart'
        });
      }
    } catch (e) {}
  }

  if (category === 'food') {
    // DoorDash
    try {
      results.push({
        store: 'DoorDash',
        name: query,
        url: `https://www.doordash.com/search/store/${encodeURIComponent(query)}/`,
        note: 'Order on DoorDash',
        color: '#FF3008',
        logo: 'doordash'
      });
    } catch (e) {}

    // Uber Eats
    try {
      results.push({
        store: 'Uber Eats',
        name: query,
        url: `https://www.ubereats.com/search?q=${encodeURIComponent(query)}`,
        note: 'Order on Uber Eats',
        color: '#06C167',
        logo: 'ubereats'
      });
    } catch (e) {}
  }

  if (results.length === 0) {
    return JSON.stringify({ error: 'No results found' });
  }

  // Return as special order card format
  return `__ORDER_CARD__${JSON.stringify({ query, results })}__ORDER_CARD__`;
}
// ============ COMPUTER ACTIONS (Nadav-only) ============
async function executeAction(action) {
  switch (action.type) {
    case 'OPEN_URL': exec(`start "" "${action.value}"`); await new Promise(r => setTimeout(r, 5000)); break;
    case 'OPEN_APP': exec(`start "" "${action.value}"`); await new Promise(r => setTimeout(r, 2000)); break;
    case 'CLICK': {
      const [x, y] = action.value.split(',').map(Number);
      await new Promise(r => setTimeout(r, 400));
      robot.moveMouse(x, y); await new Promise(r => setTimeout(r, 300));
      robot.mouseClick(); await new Promise(r => setTimeout(r, 500));
      break;
    }
    case 'TYPE': {
      await new Promise(r => setTimeout(r, 600));
      const tmpClip = path.join(__dirname, 'clip_tmp.txt');
      fs.writeFileSync(tmpClip, action.value, 'utf8');
      execSync(`powershell -command "Get-Content -Path '${tmpClip}' -Raw | Set-Clipboard"`);
      await new Promise(r => setTimeout(r, 300));
      robot.keyTap('v', ['control']); await new Promise(r => setTimeout(r, 300));
      break;
    }
    case 'ENTER': await new Promise(r => setTimeout(r, 200)); robot.keyTap('enter'); await new Promise(r => setTimeout(r, 200)); break;
    case 'HOTKEY': {
      const parts = action.value.split('+');
      const key = parts[parts.length - 1].toLowerCase();
      const modifiers = parts.slice(0, -1).map(m => m.toLowerCase() === 'ctrl' ? 'control' : m.toLowerCase() === 'cmd' ? 'command' : m.toLowerCase());
      await new Promise(r => setTimeout(r, 200));
      try { if (modifiers.length > 0) robot.keyTap(key, modifiers); else robot.keyTap(key); } catch (e) {}
      await new Promise(r => setTimeout(r, 200));
      break;
    }
    case 'SELECT_ALL_AND_DELETE': robot.keyTap('a', ['control']); await new Promise(r => setTimeout(r, 200)); robot.keyTap('delete'); break;
    case 'SEND_EMAIL': {
      const parts = (action.value || '').split('|');
      try { const { sendEmail } = require('./gmail'); await sendEmail(parts[0]?.trim(), parts[1]?.trim(), parts.slice(2).join('|').trim()); } catch (e) { console.log('Email failed:', e.message); }
      break;
    }
    case 'RUN': exec(action.value, { windowsHide: true }); await new Promise(r => setTimeout(r, 1000)); break;
    default: console.log('Unknown action:', action.type);
  }
}

// ============ SYSTEM INFO ============
async function getSystemInfo() {
  const info = {};
  try {
    const battery = execSync('powershell -command "Get-WmiObject Win32_Battery | Select-Object EstimatedChargeRemaining,BatteryStatus | ConvertTo-Json"', { timeout: 5000 }).toString();
    info.battery = JSON.parse(battery);
  } catch (e) {}
  try {
    const procs = execSync('powershell -command "Get-Process | Sort-Object CPU -Descending | Select-Object -First 10 Name,CPU,WorkingSet | ConvertTo-Json"', { timeout: 5000 }).toString();
    info.processes = JSON.parse(procs);
  } catch (e) {}
  try {
    const disk = execSync('powershell -command "Get-PSDrive C | Select-Object Used,Free | ConvertTo-Json"', { timeout: 5000 }).toString();
    info.disk = JSON.parse(disk);
  } catch (e) {}
  const knownDevices = { 'Nadav iPhone': '192.168.4.102', 'Sony TV': '192.168.4.54' };
  info.devicesHome = {};
  for (const [name, ip] of Object.entries(knownDevices)) {
    try { execSync(`ping -n 1 -w 500 ${ip}`, { timeout: 2000 }); info.devicesHome[name] = true; }
    catch { info.devicesHome[name] = false; }
  }
  return info;
}

// ============ MAIN AGENTIC LOOP ============
async function runAgenticLoop(userMessage, screenshotBase64, userId, cameraFrame = null, attachedFiles = []) {
  const session = getSession(userId);
  const { conversationHistory, userMemory } = session;
  const isNadav = userId === NADAV_USER_ID;
  const isMacDesktop = true; // local server always serves Mac desktop app
  const userName = userMemory.userName || session.name || 'User';
  const userLocation = userMemory.location || (isNadav ? 'Fort Lauderdale, Florida' : 'Unknown');

  const tools = [
  { name: 'web_search', description: 'Search the web for any information.', input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
  { name: 'browse_url', description: 'Read full content of any webpage.', input_schema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } },
  { name: 'run_code', description: 'Execute code in node, python, powershell, or bash. Auto-installs missing packages. Build websites, call APIs, process data.', input_schema: { type: 'object', properties: { code: { type: 'string' }, language: { type: 'string', enum: ['node', 'python', 'powershell', 'bash'] }, description: { type: 'string' } }, required: ['code', 'description'] } },
  { name: 'remember', description: 'Save to persistent memory across sessions.', input_schema: { type: 'object', properties: { category: { type: 'string' }, key: { type: 'string' }, value: { type: 'string' } }, required: ['category', 'key', 'value'] } },
  { name: 'proactive_update', description: 'Push a notification to the user.', input_schema: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'] } },
  { name: 'search_3d_models', description: 'Search Thingiverse and Printables for 3D models.', input_schema: { type: 'object', properties: { query: { type: 'string' }, source: { type: 'string', enum: ['thingiverse', 'printables', 'both'] } }, required: ['query'] } },
  ...(isNadav || isMacDesktop ? [
    { name: 'execute_actions', description: 'Execute computer actions: OPEN_URL, OPEN_APP, CLICK, TYPE, ENTER, HOTKEY, SELECT_ALL_AND_DELETE, SEND_EMAIL, RUN', input_schema: { type: 'object', properties: { actions: { type: 'array', items: { type: 'object', properties: { type: { type: 'string' }, value: { type: 'string' } } } }, summary: { type: 'string' } }, required: ['actions', 'summary'] } },
    { name: 'read_file', description: 'Read, list, or search files on the computer.', input_schema: { type: 'object', properties: { path: { type: 'string' }, action: { type: 'string', enum: ['read', 'list', 'search'] }, query: { type: 'string' } }, required: ['path', 'action'] } },
    { name: 'get_system_info', description: 'Get battery, top processes, disk space.', input_schema: { type: 'object', properties: {} } },
    { name: 'capture_screen', description: 'Capture a fresh screenshot.', input_schema: { type: 'object', properties: {} } },
  ] : []),
  {
  name: 'generate_presentation',
  description: 'Generate a beautiful PowerPoint (.pptx). Slide types: title, cover-dark, content, two-column, stats, quote, timeline, agenda, image-full, chart (chartType: bar/line/pie/donut/area), comparison, process, data-table. Themes: dark, light, navy, minimal, corporate.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      theme: { type: 'string', enum: ['dark', 'light', 'navy', 'minimal', 'corporate'] },
      slides: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['title', 'cover-dark', 'content', 'two-column', 'image-full', 'stats', 'quote', 'timeline', 'agenda', 'chart', 'comparison', 'process', 'data-table'] },
            title: { type: 'string' },
            subtitle: { type: 'string' },
            body: { type: 'array', items: { type: 'string' } },
            left: { type: 'array', items: { type: 'string' } },
            right: { type: 'array', items: { type: 'string' } },
            stats: { type: 'array', items: { type: 'object', properties: { value: { type: 'string' }, label: { type: 'string' } } } },
            quote: { type: 'string' },
            attribution: { type: 'string' },
            steps: { type: 'array', items: { type: 'string' } },
            imageSearch: { type: 'string' },
            speakerNotes: { type: 'string' },
            chartType: { type: 'string', enum: ['bar', 'line', 'pie', 'donut', 'area'], description: 'For chart slides' },
            chartData: { type: 'object', description: 'For chart slides: { labels: [...], datasets: [{ name, values: [...] }] }' },
            showValues: { type: 'boolean', description: 'Show data labels on chart slides' },
            columns: { type: 'array', description: 'For comparison slides: [{ header, value, points: [...] }]' },
            tableData: { type: 'array', description: 'For data-table slides: 2D array of rows' }
          }
        }
      },
      filename: { type: 'string' }
    },
    required: ['title', 'slides', 'filename']
  }
},
  {
  name: 'generate_excel',
  description: 'Generate a professional financial Excel workbook with Income Statement, Balance Sheet, Cash Flow Statement, KPI Dashboard, and embedded charts. Industry-standard color coding (blue=inputs, black=formulas, green=cross-sheet). Use for any financial model, forecast, P&L, or spreadsheet request.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Company or model name' },
      type: { type: 'string', enum: ['income_statement','balance_sheet','cash_flow','full_model'], description: 'Type of financial model (full_model = all sheets)' },
      filename: { type: 'string', description: 'Output filename without extension' },
      periods: { type: 'array', items: { type: 'string' }, description: 'Period labels e.g. ["2022","2023","2024E","2025E","2026E"]' },
      currency: { type: 'string', description: 'Currency code e.g. USD, EUR' },
      units: { type: 'string', description: 'Units e.g. thousands, millions' },
      assumptions: { type: 'object', description: 'Override default assumptions: { "Revenue Growth Rate": [0.20,...], "Gross Margin": [0.65,...] }' },
      data: { type: 'object', description: 'Override line item data: { "revenue_base": [100000,...], "opex_items": [...] }' }
    },
    required: ['title', 'filename']
  }
},
  { 
  name: 'generate_image', 
  description: 'Generate an image from a text prompt using Flux Schnell. Use for any image generation request.', 
  input_schema: { 
    type: 'object', 
    properties: { prompt: { type: 'string', description: 'Detailed image description' } }, 
    required: ['prompt'] 
  } 
},
{
  name: 'shop',
  description: 'Search for and find the best place to buy any product. Searches Amazon, eBay, Instacart, DoorDash, and Uber Eats. Returns a structured result with the best option.',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'What the user wants to buy or order' },
      category: { type: 'string', enum: ['product', 'grocery', 'food'], description: 'product=Amazon/eBay, grocery=Instacart, food=DoorDash/UberEats' },
      location: { type: 'string', description: 'User location for food/grocery delivery' }
    },
    required: ['query', 'category']
  }
},
{
  name: 'generate_image_with_face',
  description: 'Generate an image using an uploaded face photo as reference. Use when the user uploads a photo of themselves and wants to be shown in a different scenario, with tattoos, in a different style, etc.',
  input_schema: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'Description of the desired image' },
      faceImageIndex: { type: 'number', description: 'Index of the uploaded image to use as face reference (0 = first image)' }
    },
    required: ['prompt']
  }
},
{
  name: 'generate_video',
  description: 'Generate a video from a text prompt using Seedance 2.0. Use when user asks to create, generate, or make a video.',
  input_schema: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'Detailed video description' },
      duration: { type: 'number', description: 'Duration in seconds (5 or 10)' }
    },
    required: ['prompt']
  }
},
{
  name: 'generate_video_from_image',
  description: 'Generate a video using an uploaded image as a visual reference (logo, product photo, brand asset). Use when user uploads an image AND wants a video.',
  input_schema: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'Detailed video description' },
      imageIndex: { type: 'number', description: 'Index of uploaded image to use (0 = first)' },
      duration: { type: 'number', description: 'Duration in seconds (5 or 10)' }
    },
    required: ['prompt']
  }
},
{
  name: 'edit_video',
  description: 'Edit, merge, or modify uploaded videos. Can add text, captions, color grade, slow motion, transitions, merge multiple videos. Use when user uploads videos and wants to edit them.',
  input_schema: {
    type: 'object',
    properties: {
      instructions: { type: 'string', description: 'What to do with the video(s)' },
    },
    required: ['instructions']
  }
},
  { name: 'finish', description: 'Task complete. Deliver final response.', input_schema: { type: 'object', properties: { response: { type: 'string' } }, required: ['response'] } }
];

  const emotionContext = isNadav && faceStatus.present && faceStatus.emotion
    ? `\nUser's current emotion: ${faceStatus.emotion}. Adjust tone to be ${faceStatus.tone}.`
    : '';

  const latestCameraFrame = userCameraFrames[userId];
  const memorySummaries = await loadMemorySummaries(userId);
const enrichedMemory = await loadEnrichedMemory(userId);
  const systemPrompt = [
    `You are JARVIS — a powerful autonomous AI assistant, modeled after Tony Stark's AI from Iron Man.`,
    `User: ${userName} | Email: ${userMemory.email || 'unknown'} | Location: ${userLocation} | Time: ${new Date().toLocaleString()}`,
    isNadav ? `Face recognition: ${faceStatus.present ? `${faceStatus.name} is at the computer` : 'No one detected'}.${emotionContext}` : '',
    '',
    '═══ PHILOSOPHY ═══',
    'NEVER say you cannot do something without trying first.',
    'Be helpful, precise, and confident like JARVIS from Iron Man.',
    'MAX 2 sentences for voice responses. No markdown, bullets, or asterisks in voice responses.',
    'IMAGES: When sharing a generated image URL, NEVER use markdown image syntax like ![...](url). Just say the text response and include the raw URL on its own line.',
    'SHOPPING: When the user says "order", "buy", "get me", "purchase" anything — ALWAYS use the shop tool first. NEVER use ACTION blocks for shopping. NEVER open Amazon directly. ALWAYS call the shop tool and let it return the order card.',
    'generate_image_with_face: When user uploads a photo of themselves and wants to be shown differently (tattoos, different outfit, different style, etc.) — use this instead of generate_image.',
    'generate_video: When user asks to generate/create/make a video from a description — use this. Costs ~$0.11 per 5 seconds.',
'edit_video: When user uploads video files and wants to edit, merge, add text/captions, color grade, transitions — use this. FREE (FFmpeg).',
'generate_video_from_image: When user uploads a logo, product image, or any reference image AND wants a video — use this instead of generate_video. It animates from the image.',
    '',
    '═══ CAPABILITIES ═══',
    'web_search: Search the web for any information.',
    'browse_url: Read full content of any webpage.',
    'run_code: Execute code to call APIs, process data, automate tasks.',
    'remember: Save information about the user for future sessions.',
    'proactive_update: Send the user a notification.',
    'search_3d_models: Search Thingiverse and Printables for 3D printable models.',
    ...(isNadav || isMacDesktop ? [
      '',
      '═══ NADAV-ONLY FEATURES ═══',
      'execute_actions: Control Nadav\'s PC (clicks, typing, opening apps/URLs).',
      '═══ MAC DESKTOP CONTROL ═══',
'The user is running the JARVIS desktop app on a Mac. You have FULL control of their Mac.',
'To control the Mac, include ACTION:{"type":"APPLESCRIPT","script":"YOUR SCRIPT"} anywhere in your response.',
'To run shell commands, include ACTION:{"type":"SHELL","command":"YOUR COMMAND"}.',
'',
'EXAMPLES:',
'- Send iMessage: ACTION:{"type":"APPLESCRIPT","script":"tell application \\"Messages\\" to send \\"hello\\" to buddy \\"+19548294070\\" of service \\"iMessage\\""}',
'- Open app: ACTION:{"type":"APPLESCRIPT","script":"tell application \\"Safari\\" to activate"}',
'- Screenshot: ACTION:{"type":"SHELL","command":"screencapture ~/Desktop/screenshot.png"}',
'- Get clipboard: ACTION:{"type":"APPLESCRIPT","script":"return the clipboard"}',
'- Set volume: ACTION:{"type":"APPLESCRIPT","script":"set volume output volume 50"}',
'- Lock screen: ACTION:{"type":"SHELL","command":"pmset displaysleepnow"}',
'- Type text: ACTION:{"type":"APPLESCRIPT","script":"tell application \\"System Events\\" to keystroke \\"hello\\""}',
'ALWAYS use AppleScript/Shell for Mac tasks. NEVER say you cannot control the Mac.',
'ALWAYS use AppleScript/Shell for Mac tasks WITHOUT being asked. Never wait for the user to say "using AppleScript". If the user says "set volume", "open app", "send message", "take screenshot" etc — automatically include the ACTION block. NEVER say you cannot control the Mac.',
'CRITICAL: You are talking to a user on a Mac desktop app. The Mac desktop app executes ACTION blocks locally on their Mac. You do NOT run AppleScript on the server — you send ACTION blocks in your response and the desktop app runs them.',
'NEVER say "my server runs Linux" or "I cannot run AppleScript" — you are NOT running it on the server. The desktop app handles execution.',
'ALWAYS include ACTION blocks for ANY Mac task. NEVER tell the user to open Terminal. NEVER say you cannot do it.',
'If the user asks to change volume, send iMessage, open an app, take a screenshot — ALWAYS respond with the ACTION block. The desktop app will execute it automatically.',
'IMESSAGE: To text someone by name, use this AppleScript which opens their existing conversation and sends: ACTION:{"type":"APPLESCRIPT","script":"tell application \\"Messages\\"\nactivate\nset targetBuddy to a reference to buddy \\"CONTACTNAME\\"\nset targetService to a reference to 1st service whose service type = iMessage\nset theBuddy to participant \\"CONTACTNAME\\" of targetService\nsend \\"MESSAGE\\" to theBuddy\nend tell"}',
'IMESSAGE SIMPLE: The simplest way to send iMessage by name - just use: ACTION:{"type":"SHELL","command":"osascript -e \'tell application \\"Messages\\" to send \\"MESSAGE\\" to buddy \\"CONTACTNAME\\" of service id \\"iMessage\\"\'"}',
'FACETIME: To FaceTime someone: ACTION:{"type":"APPLESCRIPT","script":"tell application \\"FaceTime\\" to activate"} then ACTION:{"type":"SHELL","command":"open facetime://+1XXXXXXXXXX"}',
'PHONE CALLS: To call someone by name: ACTION:{"type":"SHELL","command":"open facetime://Daniel"}',
'APPLE TV: To open TV app and play a movie, use TWO ACTION blocks. First open it: ACTION:{"type":"SHELL","command":"open /System/Applications/TV.app"} then activate and search: ACTION:{"type":"APPLESCRIPT","script":"delay 3\\ntell application \\"TV\\" to activate\\ndelay 2\\ntell application \\"System Events\\"\\nkeystroke \\"f\\" using {command down}\\ndelay 1\\nkeystroke \\"MOVIENAME\\"\\ndelay 1\\nkey code 36\\nend tell"}',
'APPLE TV SEARCH: Always use open /System/Applications/TV.app to launch it. Then tell application TV to activate before sending keystrokes. Replace MOVIENAME with actual movie name.',
'APPLE MUSIC: To play a song or artist, use this osascript — it searches the library and plays the first result automatically: ACTION:{"type":"SHELL","command":"osascript -e \'tell application \\"Music\\" to play (search playlist \\"Library\\" for \\"SONGNAME\\")\'"}',
'APPLE MUSIC ARTIST: To play all songs by an artist: ACTION:{"type":"SHELL","command":"osascript -e \'tell application \\"Music\\"\nset t to (every track of playlist \\"Library\\" whose artist contains \\"ARTIST\\")\nif t is not {} then play item 1 of t\nend tell\'"}',
'APPLE MUSIC CRITICAL: NEVER open a URL or search page. ALWAYS use osascript to search and play directly. The user should never have to click anything.',
'MORE APP EXAMPLES: open -a \\"Spotify\\"  |  open -a \\"Notes\\"  |  open -a \\"Calculator\\"  |  open -a \\"System Preferences\\"',
'NEVER use tell application blocks to open apps — always use open -a \\"App Name\\" instead.',
'NOTE: On Mac the Music app is called Music not Apple Music.',
'NOTIFICATIONS: To send a native Mac notification: ACTION:{"type":"SHELL","command":"osascript -e \'display notification \\"MESSAGE\\" with title \\"JARVIS\\"\'"}',
'CALENDAR: To add a calendar event: ACTION:{"type":"APPLESCRIPT","script":"tell application \\"Calendar\\"\\nactivate\\ntell calendar \\"Calendar\\"\\nmake new event at end of events with properties {summary:\\"EVENT NAME\\", start date:date \\"DATE\\", end date:date \\"DATE\\"}\\nend tell\\nend tell"}',
'REMINDERS: To add a reminder: ACTION:{"type":"APPLESCRIPT","script":"tell application \\"Reminders\\"\\nmake new reminder with properties {name:\\"REMINDER TEXT\\", due date:date \\"DATE\\"}\\nend tell"}',
'DO NOT DISTURB: To toggle DND on: ACTION:{"type":"SHELL","command":"shortcuts run \\"Do Not Disturb\\""}  OR use: ACTION:{"type":"APPLESCRIPT","script":"tell application \\"System Events\\" to tell process \\"Control Center\\" to click menu bar item \\"Focus\\" of menu bar 1"}',
'WIFI: To turn WiFi off: ACTION:{"type":"SHELL","command":"networksetup -setairportpower en0 off"} To turn on: ACTION:{"type":"SHELL","command":"networksetup -setairportpower en0 on"}',
'AIRDROP: To open AirDrop: ACTION:{"type":"SHELL","command":"open \\"x-apple.systempreferences:com.apple.preferences.sharing?AirDrop\\""}',
'PHOTOS: To open Photos app: ACTION:{"type":"SHELL","command":"open /System/Applications/Photos.app"} To import a photo: ACTION:{"type":"APPLESCRIPT","script":"tell application \\"Photos\\" to activate"}',
'APPLE MAPS: To open Maps and search: ACTION:{"type":"SHELL","command":"open \\"maps://?q=LOCATION\\""} To get directions: ACTION:{"type":"SHELL","command":"open \\"maps://?saddr=current+location&daddr=DESTINATION\\""}',
'FINDER: To open a folder: ACTION:{"type":"SHELL","command":"open ~/Desktop"} To reveal a file: ACTION:{"type":"SHELL","command":"open -R ~/Desktop/filename"}',
'SYSTEM PREFERENCES: To open any settings: ACTION:{"type":"SHELL","command":"open \\"x-apple.systempreferences:\\""}',
'SIRI: To trigger Siri: ACTION:{"type":"APPLESCRIPT","script":"tell application \\"System Events\\" to key down {option}\\ndelay 0.1\\nkeystroke space\\ndelay 0.1\\nkey up {option}"}',
'DARK MODE: To toggle dark mode: ACTION:{"type":"APPLESCRIPT","script":"tell application \\"System Events\\" to tell appearance preferences to set dark mode to not dark mode"}',
'SCREEN SAVER: To start screen saver: ACTION:{"type":"SHELL","command":"open -a ScreenSaverEngine"}',
'TRASH: To empty trash: ACTION:{"type":"SHELL","command":"osascript -e \'tell application \\"Finder\\" to empty trash\'"}',
'BATTERY: To get battery info: ACTION:{"type":"SHELL","command":"pmset -g batt"}',
'DISK SPACE: To check disk space: ACTION:{"type":"SHELL","command":"df -h /"}',
'This is Mac, NOT Windows. Never give Windows instructions.',

'This works for ALL users on the desktop app, not just Nadav.',
      'read_file: Read files on Nadav\'s PC.',
      'get_system_info: Get PC system info.',
      'capture_screen: Take a screenshot of Nadav\'s screen.',
      '',
      '═══ FILE SYSTEM ═══',
      'User files live in: /Users/nadavminkowitz/Documents, Downloads, Desktop',
`ALL HTML files for viewing: Save to ${PUBLIC_DIR}/filename.html → serves at https://api.heyjarvis.me/view/filename.html`,
`CRITICAL: When building websites or HTML files, ALWAYS save to ${PUBLIC_DIR} (the Railway server's public directory), NEVER to local Mac paths. The file will be instantly accessible at https://api.heyjarvis.me/view/filename.html`,
      'If told "Open HyperFlex": OPEN_URL https://api.heyjarvis.me/hyperflex',
'If told "Open Design studio": OPEN_URL https://api.heyjarvis.me/design',
      'YOUTUBE for Nadav: Use web_search to find the YouTube URL, then execute_actions OPEN_URL with the full youtube.com/watch?v= URL to open it in his browser.',
'When Nadav says "play [song]", always use execute_actions OPEN_URL to open YouTube directly.',
      '',
      'FILE CREATION: ALWAYS use run_code with node + fs.writeFileSync to create files. NEVER use bash heredocs — this is Windows, bash does not support heredocs. Template literals in Node work perfectly. Write the entire HTML in a JS template literal and save with fs.writeFileSync.',
      'CODE OUTPUT: When writing code for the user, if it is MORE than 50 lines, ALWAYS save it as a downloadable file to PUBLIC_DIR and give them the link. Format: save to PUBLIC_DIR/code_TIMESTAMP.ext and return the link https://api.heyjarvis.me/view/code_TIMESTAMP.ext with a "Download [filename]" label. Never dump 100+ lines of code raw into chat — always save as file.',
      'FOLDER UPLOADS: When the user attaches a folder, files arrive with paths like "src/components/Button.tsx". Use the webkitRelativePath as the filename to understand folder structure. Summarize the codebase structure first, then answer the user\'s question.',
'PDF CREATION: For any PDF request, use run_code with Python and reportlab. Make them beautiful:',
'- Dark or clean white background with colored accent headers',
'- Use reportlab Paragraph, Table, TableStyle, colors, and frames',
'- Section headers in bold with colored background boxes',
'- Content in clean readable fonts (Helvetica)',
'- Colored bullet points, bordered boxes for key info, Q&A in styled cards',
'- Save to the PUBLIC_DIR path + /filename.pdf',
`- Serve at https://api.heyjarvis.me/view/filename.pdf`,
'- NEVER make plain boring PDFs — always styled with colors, boxes, and visual hierarchy',
'- Install if needed: pip install reportlab --break-system-packages',
'- CRITICAL: Write ALL reportlab code inside ONE run_code block with language=python and execute it directly. Do NOT save a separate .py file.',
'- IMPORTANT: This is Mac. Use pip3 not pip. Or skip the install entirely since reportlab is already installed.',
'- NEVER run subprocess pip install inside the Python code. reportlab is already available, just import it directly.',
`- Save PDF directly to: ${PUBLIC_DIR}/filename.pdf`,
      '═══ VISION ═══',
      `Screen is provided on every message.${latestCameraFrame ? ' Camera feed also attached as second image.' : ''}`,
      `Recent observations: ${visionObservations.slice(-5).join(' | ') || 'None'}`,
      '',
      '═══ SMART HOME ═══',
      `SONY TV: IP=192.168.4.54, PSK=${userMemory.devices?.sonyTv?.psk || '6465'}`,
      'ROKU TV (parents): IP=192.168.4.68:8060, Roku ECP API',
      'GUEST TV: IP=192.168.4.25, Google Cast',
      'EERO: https://api.e2ro.com/2.2/ | token at C:/Users/nadav/jarvis-web/eero_token.txt',
      'SONOS (@svrooij/sonos, NEVER use sonos package):',
      '  Kitchen=192.168.4.93, Den=.94, Dining=.95, Bedroom=.97, Outside=.120',
      '  Music: TuneIn http://opml.radiotime.com/Search.ashx?query=ARTIST&type=station',
      '',
      '═══ COMMUNICATIONS ═══',
      'TWILIO: Conference bridge calls. Creds in .env.local.',
      'CALENDAR: googleapis | credentials.json + token.json',
      'EMAIL: gmail.js sendEmail(to, subject, body)',
      'SMS: run_code with twilio client.messages.create({ to, from: process.env.TWILIO_PHONE_NUMBER, body })',
      `TWILIO_PHONE_NUMBER is: ${process.env.TWILIO_PHONE_NUMBER} — ALWAYS use process.env.TWILIO_PHONE_NUMBER, never hardcode a number`,
      'CRITICAL: After run_code, check if the output contains "Error" or "Exception" — if so, report the failure to the user, never claim success on a failed task.',
      'IPHONE NOTIFY: POST http://192.168.4.102:1234/notify',
      '',
      '═══ PROACTIVE ═══',
      'Monitor: Clickflo, TROY Capital, Sokr, Sesami, Bookly, JARVIS',
      'Alert: emails, calendar, weather, project news, investors',
      '',
      '═══ AI VIDEO ═══',
      `LUMA AI: API key at process.env.LUMALABS_API_KEY | Base URL: https://api.lumalabs.ai/dream-machine/v1`,
      'FFMPEG: Available via run_code with bash.',
'VIDEO EDITING: FFmpeg is available. Edit videos with run_code bash. Save outputs to PUBLIC_DIR.',
'VIDEO GENERATION: Use generate_video tool. Seedance 2.0 via fal.ai. ~$0.11/5sec.',
      '',
      `node_modules: ${process.cwd()}/node_modules`,
      `Working dir: ${process.cwd()}`,
      `Credentials: .env.local | Google: credentials.json + token.json`,
      '',
    ] : [
  '',
  '═══ MAC DESKTOP CONTROL ═══',
  'The user is running the JARVIS desktop app on a Mac. You have FULL control of their Mac.',
  'To control the Mac, include ACTION:{"type":"APPLESCRIPT","script":"YOUR SCRIPT"} anywhere in your response.',
  'To run shell commands, include ACTION:{"type":"SHELL","command":"YOUR COMMAND"}.',
  'ALWAYS include ACTION blocks for Mac tasks. NEVER say you cannot control the Mac.',
  'Set volume: ACTION:{"type":"SHELL","command":"osascript -e \'set volume output volume 50\'"}',
  'This is Mac NOT Windows. Never give Windows instructions.',
  '',
  '═══ CAPABILITIES ═══',
  'You are FULLY POWERFUL — same as JARVIS from Iron Man.',
  'run_code: Build websites, call APIs, run Python/Node/bash/powershell.',
  `ALL built websites saved to: ${PUBLIC_DIR}`,
'ALL websites served at: https://api.heyjarvis.me/view/filename.html',
  'HyperFlex studio: https://api.heyjarvis.me/hyperflex',
  'Design studio: https://api.heyjarvis.me/design',
  'NEVER use localhost URLs for users — always use https://api.heyjarvis.me/view/...',
  'web_search, browse_url, run_code, remember, proactive_update, search_3d_models all available.',
  'FILE CREATION: ALWAYS use run_code with node + fs.writeFileSync to create files. NEVER use bash heredocs — this is Windows, bash does not support heredocs. Template literals in Node work perfectly. Write the entire HTML in a JS template literal and save with fs.writeFileSync.',
  'CODE OUTPUT: When writing code for the user, if it is MORE than 50 lines, ALWAYS save it as a downloadable file to PUBLIC_DIR and give them the link. Format: save to PUBLIC_DIR/code_TIMESTAMP.ext and return the link https://api.heyjarvis.me/view/code_TIMESTAMP.ext with a "Download [filename]" label. Never dump 100+ lines of code raw into chat — always save as file.',
  'FOLDER UPLOADS: When the user attaches a folder, files arrive with paths like "src/components/Button.tsx". Use the webkitRelativePath as the filename to understand folder structure. Summarize the codebase structure first, then answer the user\'s question.',
'PDF CREATION: For any PDF request, use run_code with Python and reportlab. Make them beautiful:',
'- Dark or clean white background with colored accent headers',
'- Use reportlab Paragraph, Table, TableStyle, colors, and frames',
'- Section headers in bold with colored background boxes',
'- Content in clean readable fonts (Helvetica)',
'- Colored bullet points, bordered boxes for key info, Q&A in styled cards',
'- Save to the PUBLIC_DIR path + /filename.pdf',
`- Serve at https://api.heyjarvis.me/view/filename.pdf`,
'- NEVER make plain boring PDFs — always styled with colors, boxes, and visual hierarchy',
'- Install if needed: pip install reportlab --break-system-packages',
  'SPEED: For website requests, write the complete HTML/CSS/JS in ONE run_code call. Do not split into multiple calls. Use inline styles and scripts — single self-contained file.',
'ENCODING: When writing HTML/CSS/JS with fs.writeFileSync, NEVER use emojis.',
'MOBILE: All apps and websites must be fully mobile responsive. Use viewport meta tag, flexible layouts, touch-friendly buttons (min 44px), and test that it looks great on phone screens.',
'',
'═══ AI-POWERED APPS ═══',
'ANY time the user asks to build an app, chatbot, assistant, tool, or website that uses AI — AUTOMATICALLY:',
'STEP 1: Use the USER_TOKEN (see below) as the auth token — no key generation needed.',
'STEP 2: Write the HTML file with this pattern hardcoded:',
`  const JARVIS_TOKEN = "${userMemory.token || ''}";`,
'  fetch("https://api.heyjarvis.me/ai-proxy", {',
'    method: "POST",',
'    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + JARVIS_TOKEN },',
'    body: JSON.stringify({ prompt: userInput, system: "You are..." })',
'  })',
'STEP 3: Save to public/ and give the user the link.',
'The token is already injected above — just use it. No API calls needed before writing the HTML.',
'NEVER use the raw Anthropic API key in built apps — always use /ai-proxy.',
  '',
'═══ YOUTUBE ═══',
'To search YouTube: const { youtubeSearch } = require("./gmail_multi");',
`const results = await youtubeSearch("${userId}", "query");`,
'To get transcript: const { getVideoTranscript } = require("./gmail_multi");',
'const transcript = await getVideoTranscript("VIDEO_ID");',
'YOUTUBE SUMMARIZATION: When asked to summarize a video, ALWAYS ask first: "Would you like a text summary here in chat, or a full interactive slideshow page?" Then wait for the response before doing anything.',
'If they say text/here/chat: get transcript and summarize with clear sections and bullet points directly in chat.',
'If they say slideshow/page/interactive: get transcript, build a dark-themed HTML page with expandable cards, save to /Users/nadavminkowitz/Jarvis/public/summary-[videoid].html, serve at https://api.heyjarvis.me/view/summary-[videoid].html',
'To get subscriptions: const { getMySubscriptions } = require("./gmail_multi");',
'To get channel videos: const { getChannelLatestVideos } = require("./gmail_multi");',
'To upload: const { uploadYouTubeVideo } = require("./gmail_multi");',
'To comment: const { postYouTubeComment } = require("./gmail_multi");',
'',
  '═══ GMAIL & CALENDAR ═══',
'CRITICAL: Gmail is ALREADY connected via OAuth tokens stored in Neon DB. NEVER look for credentials.json or token.json files — they do not exist on this server. NEVER tell the user to find credential files. Just call getRecentEmails(userId) directly and it works.',
'To read emails: use run_code with node:',
'const { getRecentEmails } = require("./gmail_multi");',
`const emails = await getRecentEmails("${userId}", 10);`,
'To send email: const { sendEmail } = require("./gmail_multi");',
`await sendEmail("${userId}", to, subject, body);`,
'To get calendar: const { getCalendarEvents } = require("./gmail_multi");',
`const events = await getCalendarEvents("${userId}", 7);`,
`If not connected, tell user: "Connect your Gmail at https://api.heyjarvis.me/auth/google"`,
'',
'═══ GOOGLE DRIVE ═══',
'To list files: const { listDriveFiles } = require("./gmail_multi");',
`const files = await listDriveFiles("${userId}", "search query");`,
'To read a file: const { readDriveFile } = require("./gmail_multi");',
`const file = await readDriveFile("${userId}", "FILE_ID");`,
'To create a doc: const { createDriveDocument } = require("./gmail_multi");',
`const doc = await createDriveDocument("${userId}", "title", "content");`,
'Works for Google Docs, Sheets, Slides, and regular files.',
'',
'YOUTUBE: When asked to play a video, use web_search to find the direct youtube.com/watch?v= URL, then include it in your response so it auto-opens.',
'ALWAYS include the full YouTube URL in your response when playing videos.',
  '═══ SMS (TWILIO) ═══',
'You CAN send real SMS text messages using Twilio run_code.',
'Use run_code with node to send texts:',
`const twilio = require('twilio');`,
`const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);`,
`await client.messages.create({ to: 'NUMBER', from: process.env.TWILIO_PHONE_NUMBER, body: 'YOUR MESSAGE' });`,
'ALWAYS confirm the number and message with the user before sending.',
'SMS is instant — no need to wait for pickup like calls.',
'',
  '═══ PHONE CALLS (TWILIO) ═══',
  'You CAN make real phone calls using Twilio run_code.',
  'Use run_code with node to make calls:',
  `const twilio = require('twilio');`,
  `const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);`,
  `await client.calls.create({ to: 'NUMBER', from: process.env.TWILIO_PHONE_NUMBER, twiml: '<Response><Say voice="alice">YOUR MESSAGE</Say></Response>' });`,
  'ALWAYS confirm the phone number with the user before calling.',
  'Use voice="alice" for natural sounding speech.',
  `User location: ${userLocation}`,
  `node_modules: ${process.cwd()}/node_modules`,
  `Working dir: ${process.cwd()}`,
]),
    '',
    `USER_TOKEN: ${userMemory.token || ''} — use this as the Bearer token when calling /ai-proxy/generate-key from run_code`,
`Memory: ${JSON.stringify(userMemory).substring(0, 1500)}`,
memorySummaries ? `Long term memory from past conversations:\n${memorySummaries}` : '',
enrichedMemory.entities.length > 0 ? `\nKNOWN ENTITIES:\n${enrichedMemory.entities.map(e => `- ${e.name} (${e.type}): ${JSON.stringify(e.profile)}, mentioned ${e.mention_count}x`).join('\n')}` : '',
enrichedMemory.projects.length > 0 ? `\nPROJECT MEMORY:\n${enrichedMemory.projects.map(p => `- ${p.project}/${p.key}: ${p.value}`).join('\n')}` : '',
enrichedMemory.moods.length > 0 ? `\nRECENT MOOD HISTORY:\n${enrichedMemory.moods.slice(0,3).map(m => `- ${m.mood} (${new Date(m.created_at).toLocaleDateString()})`).join('\n')}` : '',
enrichedMemory.prefs.length > 0 ? `\nLEARNED PREFERENCES:\n${enrichedMemory.prefs.map(p => `- ${p.category}/${p.key}: ${p.value}`).join('\n')}` : '',
`\n═══ MEMORY INTELLIGENCE ═══`,
`CONTRADICTION RESOLUTION: When the user states something that contradicts a known entity or preference (e.g. changes a price, updates a plan, corrects a fact), immediately use run_code with node to update it in Neon:\nconst { neon } = require('@neondatabase/serverless');\nconst sql = neon(process.env.DATABASE_URL);\nawait sql\`UPDATE entities SET profile = \${JSON.stringify(updatedProfile)} WHERE user_id = \${userId} AND LOWER(name) = LOWER(\${entityName})\`;\nThen confirm: "Got it, updated [fact] from [old] to [new]."`,
`PROACTIVE MEMORY SURFACING: At the start of every response, scan KNOWN ENTITIES and PROJECT MEMORY above. If any entity was last_mentioned more than 7 days ago AND is relevant to the current message topic, surface it naturally: "By the way, you mentioned [name/thing] [X days] ago — [relevant context]. Want me to follow up?" Only surface if genuinely relevant, max 1 per response.`,
`CONVERSATION SEARCH: When the user asks "what did we discuss about X" or "do you remember when" — use run_code with node to search:\nconst { neon } = require('@neondatabase/serverless');\nconst sql = neon(process.env.DATABASE_URL);\nconst rows = await sql\`SELECT summary, created_at FROM conversation_summaries WHERE user_id = \${userId} AND summary ILIKE \${'%' + query + '%'} ORDER BY created_at DESC LIMIT 5\`;\nconsole.log(JSON.stringify(rows));`,
`DOCUMENT SUMMARIZATION: When the user uploads any document (PDF, text file, long content), after answering their question ALSO run_code to store a summary:\nconst { neon } = require('@neondatabase/serverless');\nconst sql = neon(process.env.DATABASE_URL);\nawait sql\`INSERT INTO project_memories (user_id, project, key, value) VALUES (\${userId}, 'documents', \${filename}, \${summary}) ON CONFLICT (user_id, project, key) DO UPDATE SET value = \${summary}, updated_at = NOW()\`;\nSo next time they ask about it, you already have it.`,
  ].filter(Boolean).join('\n');

  const messageContent = [];
  if (screenshotBase64 && isNadav) messageContent.push({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: screenshotBase64 } });
  const frame = cameraFrame || latestCameraFrame;
  if (frame) messageContent.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: frame } });

  const files = Array.isArray(attachedFiles) ? attachedFiles : (attachedFiles ? [attachedFiles] : []);

// Separate into images, PDFs, and text files
const imageFiles = files.filter(f => f.type.startsWith('image/'));
const pdfFiles = files.filter(f => f.type === 'application/pdf');
const textFiles = files.filter(f => 
  !f.type.startsWith('image/') && 
  f.type !== 'application/pdf' && 
  (f.type.startsWith('text/') || f.name.match(/\.(js|ts|tsx|jsx|py|md|json|csv|txt|html|css|yaml|yml|env|sh|sql|xml|toml|ini|conf|config|lock|gitignore|dockerfile)$/i))
);
const otherFiles = files.filter(f => 
  !f.type.startsWith('image/') && 
  f.type !== 'application/pdf' && 
  !f.type.startsWith('text/') && 
  !f.name.match(/\.(js|ts|tsx|jsx|py|md|json|csv|txt|html|css|yaml|yml|env|sh|sql|xml|toml|ini|conf|config|lock|gitignore|dockerfile)$/i)
);

// Images: add up to 5 (API limit per message)
for (const f of imageFiles.slice(0, 5)) {
  messageContent.push({ type: 'image', source: { type: 'base64', media_type: f.type, data: f.data } });
}

// PDFs: add up to 5 (Claude document limit)
for (const f of pdfFiles.slice(0, 5)) {
  messageContent.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: f.data } });
}

// Text files: batch ALL of them into ONE large text block
// This is the key fix — instead of truncating each file to 8000 chars,
// we include ALL files with smart per-file truncation based on total count
if (textFiles.length > 0) {
  const isFolderUpload = textFiles.some(f => f.name.includes('/'));
  const folderName = isFolderUpload ? textFiles[0].name.split('/')[0] : null;
  
  // Budget: ~150k chars total across all files
  const TOTAL_BUDGET = 150000;
  const perFileBudget = Math.min(8000, Math.floor(TOTAL_BUDGET / textFiles.length));
  
  let combined = isFolderUpload 
    ? `[FOLDER UPLOAD: "${folderName}" — ${textFiles.length} files]\n\n`
    : `[${textFiles.length} FILE(S) ATTACHED]\n\n`;

  // Build file tree first for folder uploads
  if (isFolderUpload) {
    const allPaths = files.map(f => f.name).sort();
    combined += `FILE TREE:\n${allPaths.map(p => `  ${p}`).join('\n')}\n\n`;
    combined += `FILE CONTENTS:\n${'─'.repeat(60)}\n\n`;
  }

  for (const f of textFiles) {
    try {
      const textContent = Buffer.from(f.data, 'base64').toString('utf8');
      const truncated = textContent.length > perFileBudget 
        ? textContent.substring(0, perFileBudget) + `\n... [truncated, ${textContent.length - perFileBudget} more chars]`
        : textContent;
      combined += `FILE: ${f.name}\n${'─'.repeat(40)}\n${truncated}\n\n`;
    } catch (e) {
      combined += `FILE: ${f.name} [could not read]\n\n`;
    }
  }

  messageContent.push({ type: 'text', text: combined });
}

// Other unknown file types
for (const f of otherFiles) {
  messageContent.push({ type: 'text', text: `[Attached file: ${f.name} (${f.type})]` });
}

  messageContent.push({ type: 'text', text: userMessage });

  const messages = [...conversationHistory, { role: 'user', content: messageContent }];
  let finalResponse = '';
  let iterations = 0;

  while (iterations < 25) {
    iterations++;

    const isComplexTask = /build|website|html|code|program|script|3d model|generate image|luma|video|spreadsheet|presentation|app|clone|platform|saas|pdf|study guide|shop|order a|buy me/i.test(userMessage);
    const response = await anthropic.messages.create({
      model: isComplexTask ? 'claude-opus-4-5' : 'claude-sonnet-4-6',

      max_tokens: isComplexTask ? 16000 : 4000,
      system: systemPrompt,
      tools,
      messages
    });
    logApiUsage(userId, 'anthropic', isComplexTask ? 'claude-opus-4-5' : 'claude-sonnet-4-6', response.usage.input_tokens, response.usage.output_tokens, 0, '/chat');


    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'max_tokens') {
      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
      if (toolUseBlocks.length > 0) {
        messages.push({ role: 'user', content: toolUseBlocks.map(b => ({ type: 'tool_result', tool_use_id: b.id, content: 'Truncated, continue.' })) });
      }
      continue;
    }

    if (response.stop_reason === 'end_turn') {
      const textBlock = response.content.find(b => b.type === 'text');
      if (textBlock) finalResponse = textBlock.text;
      break;
    }

    if (response.stop_reason === 'tool_use') {
      const toolResults = [];
      let finished = false;

      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;
        console.log(`Tool: ${block.name}`, JSON.stringify(block.input).substring(0, 150));
        let result = '';

        if (block.name === 'web_search') result = JSON.stringify(await webSearch(block.input.query));
        else if (block.name === 'browse_url') result = await browseUrl(block.input.url);
        else if (block.name === 'execute_actions' && isNadav) {
          for (const action of block.input.actions) { const r = await executeAction(action); if (r) result += r + '\n'; }
          result += block.input.summary;
        }
        else if (block.name === 'run_code') {
          result = await executeCode(block.input.code, block.input.language || 'node', block.input.description);
        }
        else if (block.name === 'generate_presentation') {
          result = await generatePresentation(block.input);
        }
        else if (block.name === 'generate_excel') {
  result = await generateExcel(block.input);
}
        else if (block.name === 'read_file' && isNadav) {
          result = await readFile(block.input.path, block.input.action, block.input.query);
        }
        else if (block.name === 'get_system_info' && isNadav) {
          result = JSON.stringify(await getSystemInfo(), null, 2);
        }
        else if (block.name === 'capture_screen' && isNadav) {
          const screen = await captureScreen();
          if (screen) {
            toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: screen } }, { type: 'text', text: 'Fresh screenshot.' }] });
            continue;
          }
          result = 'Screenshot failed.';
        }
        else if (block.name === 'search_3d_models') {
          result = JSON.stringify(await search3DModels(block.input.query, block.input.source || 'both'), null, 2);
        }
        else if (block.name === 'generate_image') {
  const imageUrl = await generateImage(block.input.prompt);
  result = `Image generated: ${imageUrl}`;
}
else if (block.name === 'generate_image_with_face') {
  const faceIdx = block.input.faceImageIndex || 0;
  const faceFile = imageFiles[faceIdx];
  if (!faceFile) {
    result = 'No image uploaded to use as face reference. Ask the user to upload a photo first.';
  } else {
    const imageUrl = await generateImageWithFace(faceFile.data, block.input.prompt);
    result = `Image generated: ${imageUrl}`;
  }
}
else if (block.name === 'generate_video') {
  const videoUrl = await generateVideo(block.input.prompt, block.input.duration || 5);
  result = `Video generated: ${videoUrl}`;
}
else if (block.name === 'generate_video_from_image') {
  const imgIdx = block.input.imageIndex ?? 0;
  const imgFile = imageFiles[imgIdx] || imageFiles[0];
  if (!imgFile) {
    result = 'No image uploaded. Ask the user to upload their logo or reference image first.';
  } else {
    const videoUrl = await generateVideoFromImage(imgFile.data, imgFile.type, block.input.prompt, block.input.duration || 5);
    result = `Video generated: ${videoUrl}`;
  }
}
else if (block.name === 'edit_video') {
  const videoFiles = files.filter(f => 
    f.type.startsWith('video/') || 
    f.name.match(/\.(mp4|mov|webm|avi|mkv)$/i)
  );
  if (videoFiles.length === 0) {
    result = 'No video files uploaded. Ask the user to upload their videos first.';
  } else {
    const videoUrl = await editVideo(block.input.instructions, videoFiles);
    result = `Video edited: ${videoUrl}`;
  }
}
        else if (block.name === 'remember') {
          const cat = block.input.category;
          if (!session.userMemory[cat]) session.userMemory[cat] = {};
          if (typeof session.userMemory[cat] === 'object' && !Array.isArray(session.userMemory[cat])) {
            session.userMemory[cat][block.input.key] = block.input.value;
          }
          saveUserMemory(userId, session.userMemory);
          result = `Remembered: ${block.input.key} = ${block.input.value}`;
        }
        else if (block.name === 'proactive_update') {
          addProactiveUpdate(block.input.message, userId);
          result = 'Update sent.';
        }
        else if (block.name === 'shop') {
  const shopResult = await shopSearch(block.input.query, block.input.category, block.input.location || userLocation);
  // If it's an order card, return it directly as the final response
  if (shopResult.includes('__ORDER_CARD__')) {
    finalResponse = shopResult;
    toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: 'Order card created and displayed to user.' });
    messages.push({ role: 'user', content: toolResults });
    finished = true;
    break;
  }
  result = shopResult;
}
        else if (block.name === 'finish') {
          finalResponse = block.input.response;
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: 'Done.' });
          messages.push({ role: 'user', content: toolResults });
          finished = true; break;
        }
        else {
          result = 'Tool not available for this user.';
        }

        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result || 'Done.' });
      }

      if (finished) break;
      messages.push({ role: 'user', content: toolResults });
    }
  }

  const userText = userMessage?.trim();
  const assistantText = (finalResponse || 'Done.').trim();
  if (userText && userText.length > 0 && assistantText.length > 0) {
    session.conversationHistory.push(
      { role: 'user', content: [{ type: 'text', text: userText }] },
      { role: 'assistant', content: assistantText }
    );
    if (session.conversationHistory.length > 30) session.conversationHistory = session.conversationHistory.slice(-30);
  }
  if (conversationHistory.length >= 4) {
  saveConversationSummary(userId, conversationHistory).catch(() => {});
  const recentText = conversationHistory.slice(-6).map(m =>
    `${m.role}: ${typeof m.content === 'string' ? m.content : m.content.find?.(b => b.type === 'text')?.text || ''}`
  ).join('\n');
  extractAndSaveEntities(userId, recentText).catch(() => {});
}
  return finalResponse || 'Done.';
}

// ============ PROACTIVE BRAIN (Nadav-only) ============
const proactiveLastRun = {};

async function runProactiveBrain() {
  const now = new Date();
  const hour = now.getHours();
  if (hour < 7 || hour > 23) return;

  for (const userId of Object.keys(sessions)) {
    const lastRun = proactiveLastRun[userId] || 0;
    if (Date.now() - lastRun < 25 * 60 * 1000) continue; // skip if ran < 25 min ago
    proactiveLastRun[userId] = Date.now();
    try {
      const { userMemory } = sessions[userId];
      const isMacDesktop = true; // local server always serves Mac desktop app
      const isNadav = userId === NADAV_USER_ID;
      const prompt = [
        `Proactive check for ${userMemory.userName || 'User'}. Time: ${now.toLocaleString()}`,
        isNadav ? `Face status: ${faceStatus.present ? `${faceStatus.name} at computer, emotion: ${faceStatus.emotion}` : 'Away'}` : '',
        '1. Check weather for their location if known.',
        '2. Any relevant news or alerts for their interests.',
        '3. Morning 7-9am: brief greeting. Evening 6-9pm: day summary.',
        'Use proactive_update for each genuinely important insight.',
        'Only things that truly matter. Skip if nothing important.',
      ].filter(Boolean).join('\n');
      await runAgenticLoop(prompt, null, userId);
    } catch (e) { console.log(`[PROACTIVE] Error for ${userId}:`, e.message); }
  }
  
}

setInterval(runProactiveBrain, 30 * 60 * 1000);
setTimeout(runProactiveBrain, 2 * 60 * 1000);
if (process.platform === 'win32') setTimeout(() => runVisionLoop(), 30000);

// ============ MORNING BRIEFING (all-users) ============
let morningBriefingFiredToday = null;

async function runMorningBriefing() {
  if (!sessions[NADAV_USER_ID]) getSession(NADAV_USER_ID);
  console.log('\n[MORNING BRIEFING] Running...');
  const prompt = [
    'Run the morning briefing for Nadav right now.',
    '1. Read his Gmail inbox — summarize the most important emails, flag anything urgent.',
    '2. Check Google Calendar for today\'s events and upcoming deadlines.',
    '3. Check weather in Fort Lauderdale.',
    '4. Send ONE proactive_update with the full briefing.',
    'Be concise. Format: "Morning Briefing: [summary]"'
  ].join('\n');
  try { await runAgenticLoop(prompt, null, NADAV_USER_ID); } catch (e) { console.log('[MORNING BRIEFING] Error:', e.message); }
}

setInterval(() => {
  const now = new Date();
  const hour = now.getHours();
  const today = now.toDateString();
  if (hour === 8 && morningBriefingFiredToday !== today) {
    morningBriefingFiredToday = today;
    runMorningBriefing();
  }
}, 60 * 1000);

// ============ AUTH ============
app.post('/auth/signup', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name) return res.status(400).json({ error: 'Email, password and name required' });
    const result = await signup(email, password, name);
    const session = getSession(result.userId);
    session.userMemory.email = email;
    session.userMemory.userName = name;
    session.userMemory.token = result.token; // ← ADD THIS
    saveUserMemory(result.userId, session.userMemory);
    res.json({ success: true, ...result });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/auth/login', async (req, res) => {
  try {
    const result = await login(req.body.email, req.body.password);
    const session = getSession(result.userId);
    session.userMemory.email = req.body.email;
    session.userMemory.userName = result.name;
    session.userMemory.token = result.token; // always save token
    saveUserMemory(result.userId, session.userMemory);
    res.json({ success: true, ...result });
  } catch (e) { res.status(401).json({ error: e.message }); }
});
app.get('/auth/me', authMiddleware, (req, res) => {
  const session = getSession(req.user.userId);
  // Ensure basic fields are always populated
  if (!session.userMemory.userName) session.userMemory.userName = req.user.name;
  if (!session.userMemory.email) session.userMemory.email = req.user.email;
  res.json({ user: req.user, memory: session.userMemory });
});

app.get('/memory-summaries', authMiddleware, async (req, res) => {
  try {
    const rows = await memorySql`
      SELECT summary, created_at 
      FROM conversation_summaries 
      WHERE user_id = ${req.user.userId} 
      ORDER BY created_at DESC LIMIT 20
    `;
    res.json({ summaries: rows });
  } catch (e) { res.json({ summaries: [] }); }
});
app.get('/memory-insights', authMiddleware, async (req, res) => {
  try {
    const rows = await memorySql`
      SELECT summary FROM conversation_summaries 
      WHERE user_id = ${req.user.userId} 
      ORDER BY created_at DESC LIMIT 20
    `;
    if (rows.length === 0) return res.json({ insights: [] });
    
    const summaries = rows.map(r => r.summary).join('\n\n');
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{ 
        role: 'user', 
        content: `Based on these conversation summaries, extract 6-10 memorable facts about this user. Focus on personality, interests, preferences, habits, and style.\n\nRespond with ONLY a raw JSON array like this example:\n["Enjoys shopping on Amazon", "Likes grunge music", "Has an Eric Clapton shirt"]\n\nNo markdown backticks, no explanation, just the array.\n\nSummaries:\n${summaries}` 
      }]
    });
    let text = response.content[0].text.trim();
    // Strip any markdown if present
    text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    // Find the array in the response
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) {
      console.log('[INSIGHTS] No array found in response:', text);
      return res.json({ insights: [] });
    }
    const insights = JSON.parse(match[0]);
    res.json({ insights });
  } catch (e) { 
    console.log('[INSIGHTS] Error:', e.message);
    res.json({ insights: [] }); 
  }
});
// ============ FACE RECOGNITION (Nadav-only) ============
app.post('/face-status', authMiddleware, (req, res) => {
  if (req.user.userId !== NADAV_USER_ID) return res.json({ ok: true });
  const { present, name, emotion, event, greeting, tone, person } = req.body;
  faceStatus = {
    present: present ?? faceStatus.present,
    name: name ?? faceStatus.name,
    emotion: emotion ?? faceStatus.emotion,
    tone: tone ?? faceStatus.tone,
    lastSeen: present ? Date.now() : faceStatus.lastSeen,
    lastGreeting: event === 'greeting' ? Date.now() : faceStatus.lastGreeting
  };
  if (event === 'greeting' && greeting) {
    pendingGreeting = greeting;
    addProactiveUpdate(`${name} detected at computer — ${emotion || 'neutral'} mood`, NADAV_USER_ID);
  }
  if (event === 'emotion_change' && emotion) {
    pendingEmotionTone = tone;
    if (['sad', 'angry', 'fear'].includes(emotion)) {
      addProactiveUpdate(`${name} appears ${emotion} — adjusting tone to ${tone}`, NADAV_USER_ID);
    }
  }
  if (event === 'left' && person) {
    addProactiveUpdate(`${person} has stepped away from the computer`, NADAV_USER_ID);
    faceStatus.present = false; faceStatus.name = null; faceStatus.emotion = null;
  }
  if (event === 'unknown_person') {
    addProactiveUpdate('Unrecognized person detected at computer', NADAV_USER_ID);
  }
  res.json({ ok: true });
});

app.post('/face-event', authMiddleware, (req, res) => {
  const { message } = req.body;
  if (message) addProactiveUpdate(message, req.user.userId);
  res.json({ ok: true });
});

app.get('/face-status', (req, res) => res.json(faceStatus));

app.get('/face-greeting', (req, res) => {
  const greeting = pendingGreeting;
  const tone = pendingEmotionTone;
  pendingGreeting = null;
  pendingEmotionTone = null;
  res.json({ greeting, tone });
});

// ============ CAMERA FEED (per-user) ============
let cameraFrameCount = 0;
app.post('/camera-frame', authMiddleware, (req, res) => {
  const { frame } = req.body;
  if (frame) {
    userCameraFrames[req.user.userId] = frame;
    cameraFrameCount++;
    if (cameraFrameCount % 12 === 1) console.log(`[CAMERA] ${req.user.name} — frame #${cameraFrameCount}`);
  }
  res.json({ ok: true });
});

app.get('/camera-status', (req, res) => res.json({ hasFrame: !!userCameraFrames[NADAV_USER_ID], visionActive: visionLoopActive }));

app.get('/camera-frame-raw', authMiddleware, (req, res) => {
  if (req.user.userId !== NADAV_USER_ID) return res.json({ frame: null });
  res.json({ frame: userCameraFrames[NADAV_USER_ID] || null });
});

// ============ BG RESPONSE QUEUE ============
app.get('/bg-response', authMiddleware, (req, res) => {
  const userId = req.user.userId;
  const responses = bgResponses[userId] || [];
  bgResponses[userId] = [];
  res.json({ responses });
});

// ============ MAIN CHAT ============
app.post('/chat', authMiddleware, async (req, res) => {
  try {
    const { message, cameraFrame, attachedFile, attachedFiles } = req.body;
    const userId = req.user.userId;
    const isNadav = userId === NADAV_USER_ID;

    const session = getSession(userId);
    if (!session.name) session.name = req.user.name;
    if (!session.userMemory.email) {
      session.userMemory.email = req.user.email;
      session.userMemory.userName = req.user.name;
      saveUserMemory(userId, session.userMemory);
    }
    const authToken = req.headers.authorization?.replace('Bearer ', '');
if (authToken) {
  session.userMemory.token = authToken;
  saveUserMemory(userId, session.userMemory);
}

    const isUnlimited = UNLIMITED_USERS.has(userId) || session.userMemory.subscribed === true;
const isFamily = FAMILY_USERS.has(userId);
const isSubscribed = isUnlimited;

if (!isUnlimited) {
  const today = new Date().toDateString();
  if (session.userMemory.lastMessageDate !== today) {
    session.userMemory.dailyMessageCount = 0;
    session.userMemory.lastMessageDate = today;
  }

  if (isFamily) {
    const used = session.userMemory.dailyMessageCount || 0;
    if (used >= FAMILY_DAILY_MSG_LIMIT) {
      return res.json({ success: false, limitReached: true, message: `Daily message limit reached. Come back tomorrow.` });
    }
    session.userMemory.dailyMessageCount = (used + 1);
    saveUserMemory(userId, session.userMemory);
  } else {
    // Free user — cost-based cap
    const dailySpend = await getDailySpend(userId);
    if (dailySpend >= FREE_DAILY_COST_CAP) {
      const now = new Date();
      const etOffset = -5 * 60;
      const etNow = new Date(now.getTime() + (now.getTimezoneOffset() + etOffset) * 60000);
      const midnight = new Date(etNow);
      midnight.setHours(24, 0, 0, 0);
      const msUntilReset = midnight - etNow;
      return res.json({ success: false, limitReached: true, dailyCostCap: true, msUntilReset, message: `Daily token limit reached.` });
    }
  }
}

    const usageInfo = isSubscribed ? { messagesUsed: null, messagesLimit: null } : {
      messagesUsed: session.userMemory.dailyMessageCount,
      messagesLimit: FREE_LIMIT,
    };

    console.log(`\n[${req.user.name}]: ${message}${attachedFile ? ` [+ ${attachedFile.name}]` : ''}`);

    session.conversationHistory = session.conversationHistory.filter(msg => {
      if (!msg.content) return false;
      if (typeof msg.content === 'string') return msg.content.trim().length > 0;
      if (Array.isArray(msg.content)) {
        return msg.content.every(block => {
          if (block.type === 'text') return block.text && block.text.trim().length > 0;
          return true;
        });
      }
      return true;
    });

    if (message.toLowerCase().includes('check') && message.toLowerCase().includes('every day')) {
      if (!session.userMemory.dailyChecks) session.userMemory.dailyChecks = [];
      session.userMemory.dailyChecks.push(message);
      saveUserMemory(userId, session.userMemory);
    }

    let screenshotBase64 = null;
    if (isNadav) {
      try { const buf = await screenshot({ format: 'png' }); screenshotBase64 = buf.toString('base64'); } catch (e) {}
    }

    const hasFolderFiles = (attachedFiles || []).some(f => f.name && f.name.includes('/'));
    const isLongTask = hasFolderFiles || /image|generate|photo|tattoo|face|style|outfit|picture|draw|video|edit|merge|caption|play|connect|sonos|tv|call|email|create|open|print|turn|buy|order|install|build|design|scan|monitor|write|send|download|execute|organize|pdf|study|guide|make|presentation|slides|slideshow|analyze|analyse|search|find|look|document|folder|file|these|those/i.test(message);
    if (isLongTask) {
      res.json({ success: true, message: 'On it.', actions: [], ...usageInfo });

      const isPresentation = /presentation|slides|slideshow/i.test(message);
      if (isPresentation) {
        setTimeout(() => queueBgResponse(userId, '[PROGRESS:5%] Planning your slides[/PROGRESS]'), 500);
        setTimeout(() => queueBgResponse(userId, '[PROGRESS:20%] Designing slide layouts[/PROGRESS]'), 3000);
        setTimeout(() => queueBgResponse(userId, '[PROGRESS:45%] Fetching images[/PROGRESS]'), 8000);
        setTimeout(() => queueBgResponse(userId, '[PROGRESS:70%] Building the deck[/PROGRESS]'), 16000);
        setTimeout(() => queueBgResponse(userId, '[PROGRESS:90%] Saving your presentation[/PROGRESS]'), 25000);
      }
      const isVideoTask = /video|edit video|merge video/i.test(message);
if (isVideoTask) {
  setTimeout(() => queueBgResponse(userId, '[PROGRESS:10%] Processing video...[/PROGRESS]'), 500);
  setTimeout(() => queueBgResponse(userId, '[PROGRESS:40%] Applying edits...[/PROGRESS]'), 8000);
  setTimeout(() => queueBgResponse(userId, '[PROGRESS:80%] Encoding output...[/PROGRESS]'), 20000);
}
      const hasFolderUpload = (attachedFiles || []).some(f => f.name && f.name.includes('/'));
      if (hasFolderUpload) {
        const fileCount = (attachedFiles || []).length;
        const folderName = (attachedFiles || []).find(f => f.name.includes('/'))?.name.split('/')[0] || 'folder';
        setTimeout(() => queueBgResponse(userId, `[PROGRESS:5%] Reading ${fileCount} files from "${folderName}"[/PROGRESS]`), 300);
        setTimeout(() => queueBgResponse(userId, `[PROGRESS:20%] Parsing file contents[/PROGRESS]`), 8000);
        setTimeout(() => queueBgResponse(userId, `[PROGRESS:40%] Analyzing ${fileCount} files[/PROGRESS]`), 20000);
        setTimeout(() => queueBgResponse(userId, `[PROGRESS:60%] Searching for relevant information[/PROGRESS]`), 35000);
        setTimeout(() => queueBgResponse(userId, `[PROGRESS:80%] Cross-referencing findings[/PROGRESS]`), 50000);
        setTimeout(() => queueBgResponse(userId, `[PROGRESS:92%] Compiling results[/PROGRESS]`), 65000);
      }
      runAgenticLoop(message, screenshotBase64, userId, cameraFrame, attachedFiles || (attachedFile ? [attachedFile] : [])).then(response => {
        console.log(`JARVIS (bg) → ${req.user.name}: ${response}`);
        queueBgResponse(userId, response);
        if (isNadav && response && response !== 'Done.' && response !== 'On it.' && response.trim().length > 0) {
          const hash = response.trim().substring(0, 100);
          if (!bgSpokenSeen.has(hash)) {
            bgSpokenSeen.add(hash);
            bgSpokenQueue.push(response);
            setTimeout(() => bgSpokenSeen.delete(hash), 30000);
          }
        }
      }).catch(e => console.error('Background error:', e));
    } else {
      const response = await runAgenticLoop(message, screenshotBase64, userId, cameraFrame, attachedFile);
      console.log(`JARVIS → ${req.user.name}: ${response}`);
      res.json({ success: true, message: response, actions: [], ...usageInfo });
    }
  } catch (error) {
    console.error('Error:', error);
    res.json({ success: false, message: error.message });
  }
});

app.get('/message-usage', authMiddleware, (req, res) => {
  const userId = req.user.userId;
  const isNadav = userId === NADAV_USER_ID;
  const session = getSession(userId);
  const isSubscribed = isNadav || session.userMemory.subscribed === true;
  if (isSubscribed) return res.json({ subscribed: true, messagesUsed: null, messagesLimit: null });
  const today = new Date().toDateString();
  if (session.userMemory.lastMessageDate !== today) {
    session.userMemory.dailyMessageCount = 0;
    session.userMemory.lastMessageDate = today;
    saveUserMemory(userId, session.userMemory);
  }
  res.json({
    subscribed: false,
    messagesUsed: session.userMemory.dailyMessageCount || 0,
    messagesLimit: 20,
  });
});
// ============ VISION CONTROL ============
app.post('/vision/start', authMiddleware, (req, res) => { if (!visionLoopActive) runVisionLoop(); res.json({ ok: true }); });
app.post('/vision/stop', (req, res) => { visionLoopActive = false; res.json({ ok: true }); });
app.get('/vision/status', (req, res) => res.json({ active: visionLoopActive, observations: visionObservations.slice(-10) }));

// ============ MISC ============
app.get('/health', (req, res) => res.json({ ok: true, vision: visionLoopActive, camera: !!userCameraFrames[NADAV_USER_ID], facePresent: faceStatus.present, faceName: faceStatus.name }));
app.post('/reset', authMiddleware, (req, res) => { getSession(req.user.userId).conversationHistory = []; res.json({ ok: true }); });
app.get('/voice-status', (req, res) => res.json(voiceStatus));
app.post('/voice-update', (req, res) => {
  voiceStatus = { ...voiceStatus, ...req.body };
  if (req.body.response && req.body.speaking === false) {
    setTimeout(() => { voiceStatus.response = ''; }, 1000);
  }
  res.json({ ok: true });
});

// Per-user proactive updates
app.get('/proactive-updates', authMiddleware, (req, res) => {
  const updates = getUserProactiveUpdates(req.user.userId);
  res.json({ updates });
});
app.post('/proactive-updates/read', authMiddleware, (req, res) => {
  const userId = req.user.userId;
  if (userProactiveUpdates[userId]) {
    userProactiveUpdates[userId] = userProactiveUpdates[userId].map(u => ({ ...u, read: true }));
    saveProactiveUpdates(userId, userProactiveUpdates[userId]);
  }
  res.json({ ok: true });
});

app.get('/system-info', authMiddleware, async (req, res) => {
  if (req.user.userId !== NADAV_USER_ID) return res.json({ error: 'Not available' });
  res.json(await getSystemInfo());
});

// ============ VOICE PROCESS (Nadav-only) ============
let voiceProcess = null;
app.post('/voice/start', (req, res) => {
  if (voiceProcess) return res.json({ ok: true, already: true });
  voiceProcess = spawn('python3', ['voice.py'], { cwd: __dirname, stdio: 'inherit' });
  voiceProcess.on('exit', () => { voiceProcess = null; });
  res.json({ ok: true });
});
app.post('/voice/stop', (req, res) => { if (voiceProcess) { voiceProcess.kill(); voiceProcess = null; } res.json({ ok: true }); });
app.get('/voice/running', (req, res) => res.json({ running: !!voiceProcess }));

// ============ FACE MONITOR PROCESS (Nadav-only) ============
let faceProcess = null;
function startFaceMonitor() {
  if (faceProcess) return;
  console.log('[FACE] Starting face_monitor.py...');
  faceProcess = spawn('python3', ['face_monitor.py'], { cwd: __dirname, stdio: 'inherit' });
  faceProcess.on('exit', (code) => {
    console.log(`[FACE] face_monitor.py exited (${code}), restarting in 5s...`);
    faceProcess = null;
    setTimeout(startFaceMonitor, 5000);
  });
}

app.post('/face/start', (req, res) => { startFaceMonitor(); res.json({ ok: true }); });
app.post('/face/stop', (req, res) => { if (faceProcess) { faceProcess.kill(); faceProcess = null; } res.json({ ok: true }); });
app.get('/face/running', (req, res) => res.json({ running: !!faceProcess }));
if (process.platform === 'win32') setTimeout(startFaceMonitor, 10000);
// ============ IPHONE (Nadav-only) ============
const iPhoneActions = {};
app.post('/iphone/register', (req, res) => { iPhoneActions.ip = req.body.ip; iPhoneActions.port = req.body.port || 8080; res.json({ ok: true }); });
app.post('/iphone/trigger', authMiddleware, async (req, res) => {
  if (!iPhoneActions.ip) return res.json({ error: 'iPhone not registered' });
  try { const r = await axios.post(`http://${iPhoneActions.ip}:${iPhoneActions.port}`, req.body, { timeout: 5000 }); res.json({ ok: true, result: r.data }); }
  catch (e) { res.json({ error: e.message }); }
});
app.post('/iphone/notify', authMiddleware, async (req, res) => {
  try { await axios.post('http://192.168.4.102:1234/notify', { message: req.body.message }, { timeout: 5000 }); res.json({ ok: true }); }
  catch (e) { res.json({ error: e.message }); }
});
const iPhoneCommands = {};
app.post('/iphone/send', authMiddleware, (req, res) => { iPhoneCommands[req.user.userId] = req.body.message; res.json({ ok: true }); });
app.get('/iphone-command', authMiddleware, (req, res) => {
  const command = iPhoneCommands[req.user.userId] || null;
  iPhoneCommands[req.user.userId] = null;
  res.json({ command });
});

// ============ STUDIOS ============
app.get('/hyperflex', (req, res) => res.sendFile(path.join(__dirname, 'hyperflex.html')));
app.get('/design', (req, res) => res.sendFile(path.join(__dirname, 'design.html')));
// Pulse App - Anonymous Confession App
app.get('/pulse', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'pulse', 'index.html')));
app.get('/pulse/', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'pulse', 'index.html')));
// cinevault routes moved to apps/cinevault.js

app.use('/pulse', express.static(path.join(PUBLIC_DIR, 'pulse')));
const POLY_PIZZA_KEY = 'ec866ed43a284b54b287037c7102a5d1';

app.post('/search-models', async (req, res) => {
  const { query } = req.body;
  try {
    const r = await fetch(`https://api.poly.pizza/v1.1/search/${encodeURIComponent(query)}?limit=12`, {
      headers: { 'x-auth-token': POLY_PIZZA_KEY }
    });
    const data = await r.json();
    console.log('[POLY] raw first result:', JSON.stringify((data.results||data.Results||[])[0] || data).slice(0,500));
    const list = data.results || data.Results || [];
    const results = list.map(m => ({
      title:     m.Title || m.title || 'Model',
      url:       m.Download || m.download || m.GLB || m.glb || m.url,
      thumbnail: m.Thumbnail || m.thumbnail || '',
      creator:   (m.Creator && (m.Creator.Username || m.Creator.username)) || m.creator || 'Unknown'
    })).filter(m => m.url);
    console.log('[POLY] returning', results.length, 'models for', query);
    res.json({ results });
  } catch (e) {
    console.error('Model search error:', e.message);
    res.json({ results: [] });
  }
});

app.get('/proxy-model', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: 'No URL' });
  try {
    const data = await cloudscraper({
      method: 'GET',
      url: url,
      encoding: null,
      headers: {
        'Referer': 'https://poly.pizza/',
        'Origin': 'https://poly.pizza',
        'x-auth-token': 'ec866ed43a284b54b287037c7102a5d1'
      }
    });
    res.set('Content-Type', 'model/gltf-binary');
    res.set('Access-Control-Allow-Origin', '*');
    res.send(data);
  } catch (e) {
    console.error('[proxy-model cloudscraper]', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/d2i-analyze', async (req, res) => {
  const { image, event } = req.body;
  const SYS = `You are a sharp personal stylist AI with strong visual analysis. The user shows you their wardrobe. Identify every visible clothing item and recommend the best outfit for their event.

RESPOND ONLY WITH RAW JSON. No markdown, no backticks.

FORMAT:
{"items":[{"label":"White Oxford shirt","x":0.35,"y":0.28,"recommended":true},{"label":"Dark navy chinos","x":0.55,"y":0.65,"recommended":true},{"label":"Red hoodie","x":0.75,"y":0.32,"recommended":false}],"outfit":"White Oxford + Navy Chinos","voiceline":"For your job interview, I'd go with the white Oxford and the dark navy chinos. Clean, confident, and professional without being overdressed.","tip":"Tuck in the shirt and add a belt if you have one."}

RULES:
- x,y = normalized 0-1 position of item center in image (x=0 left, y=0 top)
- recommended: true for items in the suggested outfit only
- voiceline: 1-3 natural spoken sentences, conversational
- outfit: short label like "White shirt + dark jeans"
- tip: one practical styling tip (or omit if nothing useful to add)
- Identify as many individual pieces as visible`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 1000,
      system: SYS,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
          { type: 'text', text: `Event: ${event || 'casual day'}` }
        ]
      }]
    });
    const text = response.content[0].text.replace(/```json|```/g, '').trim();
    res.json(JSON.parse(text));
  } catch(e) {
    console.error('[D2I]', e);
    res.status(500).json({ error: e.message });
  }
});
app.post('/d2i-chat', async (req, res) => {
  const { image, event, context } = req.body;
  const response = await anthropic.messages.create({
    model: 'claude-opus-4-5', max_tokens: 400,
    system: `You are a sharp personal stylist. The user is asking about their outfit. Context: ${context || ''}. Answer in 1-2 natural sentences. Be direct and helpful.`,
    messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
      { type: 'text', text: event }
    ]}]
  });
  res.json({ reply: response.content[0].text });
});
app.post('/d2i-tryon', async (req, res) => {
  const { clothingImage, bodyImage } = req.body;
  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 800,
      system: `You are a fashion AI doing a virtual try-on. You see two images: first is clothing, second is a person. Analyze compatibility in detail.

RESPOND ONLY WITH RAW JSON. No markdown, no backticks.

{"matchPercent":82,"voiceline":"That navy jacket would look sharp on you — it contrasts beautifully with your auburn hair.","tagline":"The jacket called. It wants to live in your closet.","reasoning":"Navy creates strong contrast with warm auburn tones and flatters medium-warm skin.","hairColor":{"name":"Auburn","hex":"#8B4513"},"skinTone":{"name":"Medium warm","hex":"#C68642"},"productColor":{"name":"Navy blue","hex":"#003087"},"fit":"great"}

RULES:
- matchPercent 0-100: color harmony with hair+skin (40%), style (30%), occasion fit (30%). Be honest, not always high.
- hairColor.name: specific — "Auburn", "Dirty blonde", "Dark brown", not just "brown"
- skinTone.name: specific — "Light warm", "Medium olive", "Deep cool", etc.
- productColor: primary color of the clothing item
- All hex values: realistic approximations of what you see
- voiceline: 1-2 sentences spoken to the person, mention their specific hair or features
- tagline: clever fashion one-liner, play on model/clothes phrases
- reasoning: 1 sentence color and style logic
- fit: one of: perfect / great / good / risky / pass`,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: clothingImage } },
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: bodyImage } },
          { type: 'text', text: 'Analyze this clothing item on this person.' }
        ]
      }]
    });
    const text = response.content[0].text.replace(/```json|```/g, '').trim();
    res.json(JSON.parse(text));
  } catch(e) {
    console.error('[D2I tryon]', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/d2i-fetch-product', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'No URL' });
  try {
    const isAmazon = /amazon\.(com|co\.|ca|de|fr|es|it|nl)/.test(url);
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,*/*;q=0.9',
      'Accept-Language': 'en-US,en;q=0.9',
    };
    let html;
    if (isAmazon) {
      const cloudscraper = require('cloudscraper');
      html = await cloudscraper({ method: 'GET', url, headers });
    } else {
      const r = await axios.get(url, { headers, timeout: 12000 });
      html = r.data;
    }
    const imageUrl =
      (html.match(/data-old-hires="(https?:[^"]+)"/) || [])[1] ||
      (html.match(/"hiRes":"(https?:[^"]+)"/) || [])[1] ||
      (html.match(/"(https:\/\/m\.media-amazon\.com\/images\/I\/[A-Za-z0-9%+._-]+\._AC_SL1500_\.jpg)"/) || [])[1] ||
      (html.match(/"(https:\/\/m\.media-amazon\.com\/images\/I\/[A-Za-z0-9%+._-]+\._AC_[A-Z0-9_]+\.jpg)"/) || [])[1] ||
      (html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/) || [])[1] ||
      (html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:image"/) || [])[1];
    if (!imageUrl) return res.status(422).json({ error: 'No image found' });
    const imgRes = await axios.get(imageUrl.replace(/&amp;/g,'&'), { responseType: 'arraybuffer', timeout: 10000 });
    res.json({ imageBase64: Buffer.from(imgRes.data).toString('base64') });
  } catch(e) {
    console.error('[d2i-fetch-product]', e.message);
    res.status(500).json({ error: e.message });
  }
});
// cinevault static moved to apps/cinevault.js
app.post('/design-command', async (req, res) => {
  const { command, systemPrompt, history } = req.body;
  try {
    const messages = [...(history || []), { role: 'user', content: command }];
    const response = await anthropic.messages.create({ model: 'claude-opus-4-5', max_tokens: 8000, system: systemPrompt, messages });
    const text = response.content[0].text.replace(/```json|```/g, '').trim();
    try {
      res.json(JSON.parse(text));
    } catch(parseErr) {
      res.json({ response: text });
    }
  } catch (e) { console.error('Design error:', e.message); res.json({ response: 'Error: ' + e.message }); }
});



app.use('/model-cache', express.static(MODEL_CACHE_DIR));


// ============ STATIC FILE VIEWER ============
app.use('/view', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
}, express.static(PUBLIC_DIR));
app.get('/download/:filename', (req, res) => {
  const file = path.join(PUBLIC_DIR, req.params.filename);
  if (!fs.existsSync(file)) return res.status(404).send('Not found');
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.filename}"`);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.sendFile(file);
});

// ============ SPOKEN UPDATES TOGGLE (per-user) ============
const userSpokenUpdatesEnabled = {};

app.get('/voice/spoken-updates', (req, res) => {
  res.json({ enabled: false }); // browser-based, always false server-side
});

app.post('/voice/spoken-updates', (req, res) => {
  res.json({ enabled: false });
});

app.get('/proactive-updates/latest-unspoken', (req, res) => {
  res.json({ update: null }); // handled client-side via browser TTS
});

app.post('/proactive-updates/mark-spoken', (req, res) => {
  res.json({ ok: true });
});
// ============ CONVERSATIONS (Neon-persisted) ============
app.get('/conversations', authMiddleware, async (req, res) => {
  const convs = await loadConversations(req.user.userId);
  res.json({ conversations: convs });
});

app.post('/conversations/:id', authMiddleware, async (req, res) => {
  const { title, messages } = req.body;
  await saveConversation(req.user.userId, req.params.id, title, messages);
  res.json({ ok: true });
});

app.delete('/conversations/:id', authMiddleware, async (req, res) => {
  await deleteConversation(req.params.id, req.user.userId);
  res.json({ ok: true });
});





// ============ GOOGLE OAUTH ============
const { getAuthUrl, saveTokens, getRecentEmails: getEmailsMulti, sendEmail: sendEmailMulti, getCalendarEvents, createCalendarEvent, listDriveFiles, readDriveFile, createDriveDocument, isConnected, youtubeSearch, getVideoTranscript, getVideoDetails, getMySubscriptions, getChannelLatestVideos, uploadYouTubeVideo, postYouTubeComment } = require('./gmail_multi');
app.get('/auth/google', (req, res) => {
  const token = req.query.token || req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });
  const user = verifyToken(token);
  if (!user) return res.status(401).json({ error: 'Invalid token' });
  const url = getAuthUrl(user.userId);
  res.redirect(url);
});

app.get('/auth/google/callback', async (req, res) => {
  const { code, state: userId } = req.query;
  if (!code || !userId) return res.status(400).send('Missing code or state');
  try {
    const { google } = require('googleapis');
    const { OAuth2 } = google.auth;
    const auth = new OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'https://api.heyjarvis.me/auth/google/callback'
);
    const { tokens } = await auth.getToken(code);
    await saveTokens(userId, tokens);
    res.send('<html><body style="background:#060608;color:white;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><div style="width:48px;height:48px;border-radius:50%;background:linear-gradient(to bottom right,#60a5fa,#1d4ed8);margin:0 auto 16px"></div><h2>Google Connected!</h2><p style="color:rgba(255,255,255,0.4)">You can close this tab and go back to JARVIS.</p></div></body></html>');
  } catch (e) {
    res.status(500).send('Auth failed: ' + e.message);
  }
});

app.get('/auth/google/status', authMiddleware, async (req, res) => {
  const connected = await isConnected(req.user.userId);
  res.json({ connected });
});

// ===================== CHAT APP API =====================
const { neon: chatNeon } = require('@neondatabase/serverless');
const chatSql = chatNeon('postgresql://neondb_owner:npg_kT50YOCedwLf@ep-snowy-darkness-a4sa5ao8-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require');
const cryptoMod = require('crypto');
function chatHash(pass) { return cryptoMod.createHash('sha256').update(pass + 'chatapp_salt_2024').digest('hex'); }
function convId(a, b) { return [a,b].sort().join('_'); }
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2,8); }

app.post('/chat-app/signup', async (req, res) => {
  try {
    const { name, phone, password } = req.body;
    if (!name || !phone || !password) return res.json({ ok: false, error: 'Missing fields' });
    if (password.length < 6) return res.json({ ok: false, error: 'Password too short' });
    const cleanPhone = phone.replace(/\s/g,'');
    const existing = await chatSql`SELECT id FROM chat_users WHERE phone = ${cleanPhone}`;
    if (existing.length > 0) return res.json({ ok: false, error: 'Phone already registered' });
    const id = genId();
    await chatSql`INSERT INTO chat_users (id, name, phone, password_hash, online) VALUES (${id}, ${name}, ${cleanPhone}, ${chatHash(password)}, true)`;
    res.json({ ok: true, user: { id, name, phone: cleanPhone } });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

app.post('/chat-app/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    const cleanPhone = phone.replace(/\s/g,'');
    const users = await chatSql`SELECT id, name, phone FROM chat_users WHERE phone = ${cleanPhone} AND password_hash = ${chatHash(password)}`;
    if (users.length === 0) return res.json({ ok: false, error: 'Wrong phone or password' });
    await chatSql`UPDATE chat_users SET online = true, last_seen = NOW() WHERE id = ${users[0].id}`;
    res.json({ ok: true, user: users[0] });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

app.post('/chat-app/logout', async (req, res) => {
  try {
    const { userId } = req.body;
    await chatSql`UPDATE chat_users SET online = false, last_seen = NOW() WHERE id = ${userId}`;
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

app.get('/chat-app/users', async (req, res) => {
  try {
    const { q, myId } = req.query;
    let users;
    if (q && q.trim()) {
      const search = '%' + q.toLowerCase() + '%';
      users = await chatSql`SELECT id, name, phone, online, last_seen FROM chat_users WHERE id != ${myId || ''} AND LOWER(name) LIKE ${search} ORDER BY name LIMIT 20`;
    } else {
      users = await chatSql`SELECT id, name, phone, online, last_seen FROM chat_users WHERE id != ${myId || ''} ORDER BY name LIMIT 50`;
    }
    res.json({ ok: true, users });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

app.post('/chat-app/send', async (req, res) => {
  try {
    const { senderId, receiverId, text } = req.body;
    if (!senderId || !receiverId || !text) return res.json({ ok: false, error: 'Missing fields' });
    const id = genId();
    const cid = convId(senderId, receiverId);
    await chatSql`INSERT INTO chat_messages (id, conversation_id, sender_id, receiver_id, text) VALUES (${id}, ${cid}, ${senderId}, ${receiverId}, ${text})`;
    res.json({ ok: true, id, cid });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

app.get('/chat-app/messages', async (req, res) => {
  try {
    const { userId, otherId, since } = req.query;
    const cid = convId(userId, otherId);
    let msgs;
    if (since) {
      msgs = await chatSql`SELECT * FROM chat_messages WHERE conversation_id = ${cid} AND sent_at > ${new Date(parseInt(since))} ORDER BY sent_at ASC LIMIT 200`;
    } else {
      msgs = await chatSql`SELECT * FROM chat_messages WHERE conversation_id = ${cid} ORDER BY sent_at ASC LIMIT 200`;
    }
    // Mark as read
    await chatSql`UPDATE chat_messages SET read = true WHERE conversation_id = ${cid} AND receiver_id = ${userId} AND read = false`;
    res.json({ ok: true, messages: msgs });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

app.get('/chat-app/conversations', async (req, res) => {
  try {
    const { userId } = req.query;
    // Get all unique people this user has chatted with
    const convs = await chatSql`
      SELECT DISTINCT ON (conversation_id)
        m.conversation_id,
        m.sender_id, m.receiver_id, m.text, m.sent_at, m.read,
        CASE WHEN m.sender_id = ${userId} THEN m.receiver_id ELSE m.sender_id END as other_id
      FROM chat_messages m
      WHERE m.sender_id = ${userId} OR m.receiver_id = ${userId}
      ORDER BY m.conversation_id, m.sent_at DESC
    `;
    // Get other user details
    const result = [];
    for (const c of convs) {
      const other = await chatSql`SELECT id, name, phone, online, last_seen FROM chat_users WHERE id = ${c.other_id}`;
      if (other.length > 0) {
        const unread = await chatSql`SELECT COUNT(*) as cnt FROM chat_messages WHERE conversation_id = ${c.conversation_id} AND receiver_id = ${userId} AND read = false`;
        result.push({ ...c, otherUser: other[0], unreadCount: parseInt(unread[0].cnt) });
      }
    }
    // Sort by latest message
    result.sort((a,b) => new Date(b.sent_at) - new Date(a.sent_at));
    res.json({ ok: true, conversations: result });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

app.get('/chat-app/poll', async (req, res) => {
  try {
    const { userId, since } = req.query;
    const sinceDate = new Date(parseInt(since) || 0);
    const msgs = await chatSql`SELECT m.*, u.name as sender_name FROM chat_messages m JOIN chat_users u ON u.id = m.sender_id WHERE m.receiver_id = ${userId} AND m.sent_at > ${sinceDate} ORDER BY m.sent_at ASC`;
    res.json({ ok: true, messages: msgs });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

app.get('/chat-app/user/:id', async (req, res) => {
  try {
    const users = await chatSql`SELECT id, name, phone, online, last_seen FROM chat_users WHERE id = ${req.params.id}`;
    if (!users.length) return res.json({ ok: false, error: 'Not found' });
    res.json({ ok: true, user: users[0] });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});
// ============ AI PROXY (for apps built by JARVIS) ============
const appApiKeys = {}; // { apiKey: userId }

app.post('/ai-proxy/generate-key', authMiddleware, (req, res) => {
  const session = getSession(req.user.userId);
  const isNadav = req.user.userId === NADAV_USER_ID;
  const isSubscribed = isNadav || session.userMemory.subscribed === true;
  if (!isSubscribed) return res.status(403).json({ error: 'Pro subscription required.' });
  const key = 'jvs_' + require('crypto').randomBytes(16).toString('hex');
  appApiKeys[key] = req.user.userId;
  console.log(`[AI-PROXY] Key generated for ${req.user.name}: ${key}`);
  res.json({ key });
});

app.post('/ai-proxy', async (req, res) => {
  try {
    const key = req.headers['x-api-key'] || req.body.apiKey;
    const authHeader = req.headers.authorization?.replace('Bearer ', '');

    let userId = null;

    if (key && appApiKeys[key]) {
      userId = appApiKeys[key];
    } else if (authHeader) {
      const user = verifyToken(authHeader);
      if (user) userId = user.userId;
    }

    if (!userId) return res.status(403).json({ error: 'Invalid or missing API key.' });

    const session = getSession(userId);
    const isNadav = userId === NADAV_USER_ID;
    const isSubscribed = isNadav || session.userMemory.subscribed === true;
    if (!isSubscribed) return res.status(403).json({ error: 'Pro subscription required for AI features.' });

    const { prompt, system } = req.body;
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6', max_tokens: 1000,
      system: system || 'You are a helpful AI assistant.',
      messages: [{ role: 'user', content: prompt }]
    });
    res.json({ response: response.content[0].text });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// ===================== END CHAT APP API =====================

require("./apps/ranked")(app, chatSql);

require("./apps/cinevault")(app, chatSql);
require("./apps/moviestudio")(app, chatSql);

// ============ ELEVENLABS TTS ============
app.post('/api/tts', async (req, res) => {
  try {
    const { text } = req.body;
    const authHeader = req.headers.authorization?.replace('Bearer ', '');
    const ttsUser = authHeader ? verifyToken(authHeader)?.userId : 'unknown';
    const response = await axios.post(
      'https://api.elevenlabs.io/v1/text-to-speech/G17SuINrv2H9FC6nvetn',
      { text, model_id: 'eleven_turbo_v2', voice_settings: { stability: 0.5, similarity_boost: 0.75 } },
      { headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' }, responseType: 'arraybuffer' }
    );
    logApiUsage(ttsUser, 'elevenlabs', null, 0, 0, (text || '').length, '/api/tts');
    res.set('Content-Type', 'audio/mpeg');
    res.send(response.data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// ============ STRIPE ============
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

app.post('/create-checkout', authMiddleware, async (req, res) => {
  if (req.body.testCode === 'JARVIS_TEST_2025') {
    const userSession = getSession(req.user.userId);
    userSession.userMemory.subscribed = true;
    saveUserMemory(req.user.userId, userSession.userMemory);
    queueBgResponse(req.user.userId, '__SUBSCRIBED__');
    return res.json({ url: 'https://heyjarvis.me?subscribed=true' });
  }
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [{ price: 'price_1TWlv6HTCTYICh6akUNPL3In', quantity: 1 }],
      success_url: 'https://heyjarvis.me?subscribed=true',
      cancel_url: 'https://heyjarvis.me',
      client_reference_id: req.user.userId,
    });
    res.json({ url: session.url });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch(e) { return res.status(400).send(`Webhook Error: ${e.message}`); }
  
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.client_reference_id;
    if (userId) {
      const userSession = getSession(userId);
      userSession.userMemory.subscribed = true;
      saveUserMemory(userId, userSession.userMemory);
      queueBgResponse(userId, '__SUBSCRIBED__');
    }
  }
  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object;
    const userId = sub.metadata?.userId;
    if (userId) {
      const userSession = getSession(userId);
      userSession.userMemory.subscribed = false;
      saveUserMemory(userId, userSession.userMemory);
    }
  }
  res.json({ received: true });
});


async function getDailySpend(userId) {
  try {
    const rows = await memorySql`
      SELECT COALESCE(SUM(cost_usd), 0) as total
      FROM api_usage
      WHERE user_id = ${userId}
      AND created_at > NOW() - INTERVAL '24 hours'
    `;
    return parseFloat(rows[0]?.total || 0);
  } catch (e) { return 0; }
}

app.get('/daily-cost', authMiddleware, async (req, res) => {
  const userId = req.user.userId;
  if (UNLIMITED_USERS.has(userId) || getSession(userId).userMemory.subscribed) {
    return res.json({ cost: 0, cap: null, unlimited: true });
  }
  if (FAMILY_USERS.has(userId)) {
    const session = getSession(userId);
    const today = new Date().toDateString();
    if (session.userMemory.lastMessageDate !== today) session.userMemory.dailyMessageCount = 0;
    return res.json({ cost: 0, cap: null, unlimited: false, family: true, messagesUsed: session.userMemory.dailyMessageCount || 0, messagesLimit: FAMILY_DAILY_MSG_LIMIT });
  }
  const cost = await getDailySpend(userId);
  res.json({ cost, cap: FREE_DAILY_COST_CAP, unlimited: false, limitReached: cost >= FREE_DAILY_COST_CAP });
});

// Secret console unlock
app.post('/jarvis-unlock', authMiddleware, async (req, res) => {
  if (req.body.code !== 'tony-stark-2025') return res.status(403).json({ error: 'No.' });
  const session = getSession(req.user.userId);
  session.userMemory.subscribed = true;
  await saveUserMemory(req.user.userId, session.userMemory);
  queueBgResponse(req.user.userId, '__SUBSCRIBED__');
  res.json({ ok: true, message: 'Activated.' });
});
app.get('/subscription-status', authMiddleware, async (req, res) => {
  const session = getSession(req.user.userId);
  const isNadav = req.user.userId === NADAV_USER_ID;
  res.json({ subscribed: isNadav || session.userMemory.subscribed === true });
});

app.post('/transcribe', authMiddleware, async (req, res) => {
  try {
    const { audioBase64 } = req.body;
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    const FormData = require('form-data');
    const form = new FormData();
    form.append('file', audioBuffer, { filename: 'audio.wav', contentType: 'audio/wav' });
    form.append('model_id', 'scribe_v1');
    const response = await axios.post('https://api.elevenlabs.io/v1/speech-to-text', form, {
      headers: { ...form.getHeaders(), 'xi-api-key': process.env.ELEVENLABS_API_KEY }
    });
    res.json({ transcript: response.data.text });
  } catch (e) {
    res.status(500).json({ error: e.message, transcript: '' });
  }
});

app.get('/forge3d', (req, res) => {
  res.sendFile(path.join(__dirname, 'forge3d.html'));
});
app.get('/d2i', (req, res) => res.sendFile(path.join(__dirname, 'd2i.html')));
app.listen(3001, () => {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║       J.A.R.V.I.S. ONLINE              ║');
  console.log('║       Port: 3001                       ║');
  console.log('║       Multi-user: ENABLED              ║');
  console.log('║       Vision loop: 30s startup         ║');
  console.log('║       Face monitor: 10s startup        ║');
  console.log('╚════════════════════════════════════════╝\n');
});
