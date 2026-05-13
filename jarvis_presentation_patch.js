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

// ── Theme definitions ────────────────────────────────────────
const THEMES = {
  dark: {
    bg: '0F1117', bgAlt: '1A1D2E', accent: '6366F1', accent2: '8B5CF6',
    text: 'F8FAFC', subtext: '94A3B8', card: '1E2235', border: '2D3151',
    titleBg: '0F1117', chartColors: ['6366F1','8B5CF6','EC4899','F59E0B','10B981'],
  },
  light: {
    bg: 'FFFFFF', bgAlt: 'F8FAFC', accent: '4F46E5', accent2: '7C3AED',
    text: '0F172A', subtext: '64748B', card: 'FFFFFF', border: 'E2E8F0',
    titleBg: '4F46E5', chartColors: ['4F46E5','7C3AED','DB2777','D97706','059669'],
  },
  navy: {
    bg: '0A1628', bgAlt: '0F2040', accent: '3B82F6', accent2: '60A5FA',
    text: 'F0F9FF', subtext: '93C5FD', card: '162036', border: '1E3A5F',
    titleBg: '0A1628', chartColors: ['3B82F6','60A5FA','34D399','FBBF24','F87171'],
  },
  minimal: {
    bg: 'FAFAFA', bgAlt: 'FFFFFF', accent: '18181B', accent2: '3F3F46',
    text: '18181B', subtext: '71717A', card: 'FFFFFF', border: 'E4E4E7',
    titleBg: '18181B', chartColors: ['18181B','3F3F46','71717A','A1A1AA','D4D4D8'],
  },
};

// ── Fetch image from Unsplash (free, no auth required) ───────
async function fetchSlideImage(query) {
  try {
    const url = `https://source.unsplash.com/1200x800/?${encodeURIComponent(query)}`;
    const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 8000, maxRedirects: 5 });
    const ct = resp.headers['content-type'] || 'image/jpeg';
    const b64 = Buffer.from(resp.data).toString('base64');
    return `${ct};base64,${b64}`;
  } catch (e) {
    console.log('[PPTX] Image fetch failed for:', query, e.message);
    return null;
  }
}

// ── Transition XML helper ─────────────────────────────────────
function makeTransition(type = 'fade', dur = 500) {
  // pptxgenjs exposes slide.transition for a handful of built-ins
  // We pass the object and let pptxgenjs handle the XML
  const map = {
    fade:    { type: 'fade',    dur },
    push:    { type: 'push',    dir: 'l', dur },
    wipe:    { type: 'wipe',    dir: 'l', dur },
    reveal:  { type: 'reveal',  dir: 'l', dur },
    zoom:    { type: 'zoom',    dir: 'in', dur },
    split:   { type: 'split',   dir: 'h', dur },
  };
  return map[type] || map.fade;
}

const TRANSITION_SEQUENCE = ['fade', 'push', 'wipe', 'reveal', 'zoom', 'split'];

// ── Main generator ────────────────────────────────────────────
async function generatePresentation({ title, theme = 'dark', slides, filename }) {
  const T = THEMES[theme] || THEMES.dark;
  const pres = new pptxgen();
  pres.layout  = 'LAYOUT_16x9';  // 10" × 5.625"
  pres.author  = 'JARVIS';
  pres.title   = title;
  pres.subject = title;

  // ── Slide master ─────────────────────────────────────────
  pres.defineSlideMaster({
    title: 'JARVIS_MASTER',
    background: { color: T.bg },
  });

  // ── Helper: add footer logo mark ─────────────────────────
  function addFooter(slide, label = '') {
    // thin accent bar at bottom
    slide.addShape(pres.shapes.RECTANGLE, {
      x: 0, y: 5.42, w: 10, h: 0.08,
      fill: { color: T.accent, transparency: 40 }, line: { color: T.accent, transparency: 40 },
    });
    if (label) {
      slide.addText(label, {
        x: 0.3, y: 5.3, w: 9.4, h: 0.25,
        fontSize: 8, color: T.subtext, align: 'right', valign: 'bottom', margin: 0,
      });
    }
  }

  // ── Helper: accent card ───────────────────────────────────
  function accentCard(slide, x, y, w, h, color = T.card) {
    slide.addShape(pres.shapes.RECTANGLE, {
      x, y, w, h,
      fill: { color },
      line: { color: T.border, pt: 0.5 },
      shadow: { type: 'outer', color: '000000', blur: 10, offset: 3, angle: 135, opacity: 0.18 },
    });
  }

  // ── Render each slide ─────────────────────────────────────
  for (let i = 0; i < slides.length; i++) {
    const sd   = slides[i];
    const slide = pres.addSlide({ masterName: 'JARVIS_MASTER' });

    // Transition (cycle through types, vary per slide)
    const tType = TRANSITION_SEQUENCE[i % TRANSITION_SEQUENCE.length];
    slide.transition = makeTransition(tType, i === 0 ? 600 : 500);

    // Speaker notes
    if (sd.speakerNotes) slide.addNotes(sd.speakerNotes);

    // ── Fetch background image if requested ──────────────
    let bgImageData = null;
    if (sd.imageSearch) {
      bgImageData = await fetchSlideImage(sd.imageSearch);
    }

    switch (sd.type) {

      // ── TITLE SLIDE ──────────────────────────────────────
      case 'title': {
        // Dark gradient overlay bg
        slide.background = { color: T.titleBg };

        // Big decorative circle (top-right)
        slide.addShape(pres.shapes.OVAL, {
          x: 7.2, y: -1.5, w: 5, h: 5,
          fill: { color: T.accent, transparency: 80 }, line: { color: T.accent, transparency: 80 },
        });
        slide.addShape(pres.shapes.OVAL, {
          x: 8, y: -0.8, w: 3.5, h: 3.5,
          fill: { color: T.accent2, transparency: 70 }, line: { color: T.accent2, transparency: 70 },
        });

        // Accent left bar
        slide.addShape(pres.shapes.RECTANGLE, {
          x: 0.5, y: 1.5, w: 0.1, h: 2.4,
          fill: { color: T.accent }, line: { color: T.accent },
        });

        // Title
        slide.addText(sd.title || title, {
          x: 0.75, y: 1.5, w: 8, h: 1.6,
          fontSize: 40, bold: true, color: T.text,
          fontFace: 'Calibri', valign: 'middle', margin: 0,
        });

        // Subtitle
        if (sd.subtitle) {
          slide.addText(sd.subtitle, {
            x: 0.75, y: 3.2, w: 7.5, h: 0.8,
            fontSize: 18, color: T.subtext, fontFace: 'Calibri Light', valign: 'top', margin: 0,
          });
        }

        // Bottom accent strip with title text
        slide.addShape(pres.shapes.RECTANGLE, {
          x: 0, y: 5.0, w: 10, h: 0.625,
          fill: { color: T.accent, transparency: 15 }, line: { color: T.accent, transparency: 15 },
        });
        slide.addText('JARVIS  ·  ' + new Date().getFullYear(), {
          x: 0.3, y: 5.05, w: 9.4, h: 0.5,
          fontSize: 9, color: T.text, align: 'right', valign: 'middle', margin: 0,
        });
        break;
      }

      // ── CONTENT (bullet) SLIDE ───────────────────────────
      case 'content': {
        slide.background = { color: T.bg };

        if (bgImageData) {
          slide.addImage({ data: bgImageData, x: 5.5, y: 0.6, w: 4.3, h: 4.5,
            sizing: { type: 'cover', w: 4.3, h: 4.5 }, transparency: 5 });
          // dark overlay on image side
          slide.addShape(pres.shapes.RECTANGLE, {
            x: 5.5, y: 0.6, w: 4.3, h: 4.5,
            fill: { color: T.bg, transparency: 30 }, line: { color: T.bg, transparency: 30 },
          });
        }

        // Title band
        slide.addShape(pres.shapes.RECTANGLE, {
          x: 0, y: 0, w: 10, h: 0.9,
          fill: { color: T.bgAlt }, line: { color: T.bgAlt },
        });
        slide.addShape(pres.shapes.RECTANGLE, {
          x: 0, y: 0, w: 0.08, h: 0.9,
          fill: { color: T.accent }, line: { color: T.accent },
        });
        slide.addText(sd.title || '', {
          x: 0.25, y: 0, w: 9.5, h: 0.9,
          fontSize: 22, bold: true, color: T.text, fontFace: 'Calibri',
          valign: 'middle', margin: 0,
        });

        // Bullet content
        const contentW = bgImageData ? 4.8 : 9.2;
        const bullets = (sd.body || []);
        if (bullets.length) {
          const items = bullets.map((b, idx) => ({
            text: b,
            options: {
              bullet: true, breakLine: idx < bullets.length - 1,
              fontSize: 15, color: T.text, fontFace: 'Calibri',
              paraSpaceAfter: 8,
            },
          }));
          slide.addText(items, { x: 0.5, y: 1.1, w: contentW, h: 4.2, valign: 'top' });
        }

        addFooter(slide, title);
        break;
      }

      // ── TWO-COLUMN SLIDE ─────────────────────────────────
      case 'two-column': {
        slide.background = { color: T.bg };

        // Title
        slide.addShape(pres.shapes.RECTANGLE, {
          x: 0, y: 0, w: 10, h: 0.85,
          fill: { color: T.bgAlt }, line: { color: T.bgAlt },
        });
        slide.addShape(pres.shapes.RECTANGLE, {
          x: 0, y: 0, w: 0.08, h: 0.85,
          fill: { color: T.accent2 }, line: { color: T.accent2 },
        });
        slide.addText(sd.title || '', {
          x: 0.25, y: 0, w: 9.5, h: 0.85,
          fontSize: 22, bold: true, color: T.text, fontFace: 'Calibri',
          valign: 'middle', margin: 0,
        });

        // Divider
        slide.addShape(pres.shapes.LINE, {
          x: 5.0, y: 1.0, w: 0, h: 4.2,
          line: { color: T.border, pt: 1 },
        });

        // Left col
        accentCard(slide, 0.3, 0.95, 4.5, 4.35, T.bgAlt);
        const leftItems = (sd.left || []).map((b, i) => ({
          text: b, options: { bullet: true, breakLine: i < (sd.left||[]).length-1, fontSize: 14, color: T.text, paraSpaceAfter: 7 },
        }));
        if (leftItems.length) slide.addText(leftItems, { x: 0.5, y: 1.1, w: 4.2, h: 4.1, valign: 'top' });

        // Right col
        accentCard(slide, 5.2, 0.95, 4.5, 4.35, T.bgAlt);
        const rightItems = (sd.right || []).map((b, i) => ({
          text: b, options: { bullet: true, breakLine: i < (sd.right||[]).length-1, fontSize: 14, color: T.text, paraSpaceAfter: 7 },
        }));
        if (rightItems.length) slide.addText(rightItems, { x: 5.4, y: 1.1, w: 4.2, h: 4.1, valign: 'top' });

        addFooter(slide, title);
        break;
      }

      // ── FULL IMAGE SLIDE ─────────────────────────────────
      case 'image-full': {
        slide.background = { color: T.bg };
        if (bgImageData) {
          slide.addImage({ data: bgImageData, x: 0, y: 0, w: 10, h: 5.625,
            sizing: { type: 'cover', w: 10, h: 5.625 } });
        }
        // Dark overlay
        slide.addShape(pres.shapes.RECTANGLE, {
          x: 0, y: 0, w: 10, h: 5.625,
          fill: { color: '000000', transparency: 40 }, line: { color: '000000', transparency: 40 },
        });
        // Bottom text band
        slide.addShape(pres.shapes.RECTANGLE, {
          x: 0, y: 4.1, w: 10, h: 1.525,
          fill: { color: '000000', transparency: 30 }, line: { color: '000000', transparency: 30 },
        });
        slide.addShape(pres.shapes.RECTANGLE, {
          x: 0, y: 4.1, w: 0.12, h: 1.525,
          fill: { color: T.accent }, line: { color: T.accent },
        });
        slide.addText(sd.title || '', {
          x: 0.3, y: 4.15, w: 9.4, h: 0.75,
          fontSize: 28, bold: true, color: 'FFFFFF', fontFace: 'Calibri', valign: 'middle', margin: 0,
        });
        if (sd.subtitle) {
          slide.addText(sd.subtitle, {
            x: 0.3, y: 4.95, w: 9.4, h: 0.45,
            fontSize: 14, color: 'DDDDDD', fontFace: 'Calibri Light', valign: 'top', margin: 0,
          });
        }
        break;
      }

      // ── STATS SLIDE ──────────────────────────────────────
      case 'stats': {
        slide.background = { color: T.bg };
        // Title
        slide.addShape(pres.shapes.RECTANGLE, {
          x: 0, y: 0, w: 10, h: 0.85,
          fill: { color: T.bgAlt }, line: { color: T.bgAlt },
        });
        slide.addShape(pres.shapes.RECTANGLE, {
          x: 0, y: 0, w: 0.08, h: 0.85,
          fill: { color: T.accent }, line: { color: T.accent },
        });
        slide.addText(sd.title || '', {
          x: 0.25, y: 0, w: 9.5, h: 0.85,
          fontSize: 22, bold: true, color: T.text, fontFace: 'Calibri', valign: 'middle', margin: 0,
        });

        const stats = sd.stats || [];
        const cols  = Math.min(stats.length, 4);
        const cardW = (9.2 / cols) - 0.15;
        stats.slice(0, 4).forEach((s, idx) => {
          const cx = 0.4 + idx * (cardW + 0.15);
          accentCard(slide, cx, 1.1, cardW, 3.7, T.bgAlt);
          // Accent top strip
          slide.addShape(pres.shapes.RECTANGLE, {
            x: cx, y: 1.1, w: cardW, h: 0.07,
            fill: { color: T.accent }, line: { color: T.accent },
          });
          // Big number
          slide.addText(s.value || '', {
            x: cx + 0.1, y: 1.5, w: cardW - 0.2, h: 2.0,
            fontSize: cols <= 2 ? 56 : 44, bold: true, color: T.accent,
            fontFace: 'Calibri', align: 'center', valign: 'middle', margin: 0,
          });
          // Label
          slide.addText(s.label || '', {
            x: cx + 0.1, y: 3.6, w: cardW - 0.2, h: 0.9,
            fontSize: 13, color: T.subtext, fontFace: 'Calibri',
            align: 'center', valign: 'top', margin: 0,
          });
        });

        addFooter(slide, title);
        break;
      }

      // ── QUOTE SLIDE ──────────────────────────────────────
      case 'quote': {
        slide.background = { color: T.titleBg };
        // Large decorative quote mark
        slide.addText('\u201C', {
          x: 0.3, y: 0.1, w: 2, h: 2,
          fontSize: 120, color: T.accent, fontFace: 'Georgia',
          align: 'left', valign: 'top', margin: 0, transparency: 60,
        });
        // Quote text
        slide.addText(sd.quote || '', {
          x: 0.9, y: 1.2, w: 8.2, h: 3.0,
          fontSize: 24, italic: true, color: T.text, fontFace: 'Georgia',
          align: 'center', valign: 'middle',
          lineSpacingMultiple: 1.4,
        });
        // Attribution
        if (sd.attribution) {
          slide.addShape(pres.shapes.RECTANGLE, {
            x: 3.5, y: 4.35, w: 3, h: 0.04,
            fill: { color: T.accent }, line: { color: T.accent },
          });
          slide.addText('\u2014 ' + sd.attribution, {
            x: 0.5, y: 4.5, w: 9, h: 0.5,
            fontSize: 14, color: T.subtext, fontFace: 'Calibri Light',
            align: 'center', valign: 'top', margin: 0,
          });
        }
        addFooter(slide, title);
        break;
      }

      // ── TIMELINE / STEPS SLIDE ───────────────────────────
      case 'timeline': {
        slide.background = { color: T.bg };
        slide.addShape(pres.shapes.RECTANGLE, {
          x: 0, y: 0, w: 10, h: 0.85,
          fill: { color: T.bgAlt }, line: { color: T.bgAlt },
        });
        slide.addShape(pres.shapes.RECTANGLE, {
          x: 0, y: 0, w: 0.08, h: 0.85,
          fill: { color: T.accent2 }, line: { color: T.accent2 },
        });
        slide.addText(sd.title || '', {
          x: 0.25, y: 0, w: 9.5, h: 0.85,
          fontSize: 22, bold: true, color: T.text, fontFace: 'Calibri', valign: 'middle', margin: 0,
        });

        const steps = sd.steps || [];
        const n     = Math.min(steps.length, 6);
        const stepW = 9.2 / n;
        // Horizontal timeline spine
        slide.addShape(pres.shapes.LINE, {
          x: 0.4 + stepW / 2, y: 2.3,
          w: stepW * (n - 1), h: 0,
          line: { color: T.accent, pt: 2 },
        });
        steps.slice(0, 6).forEach((step, idx) => {
          const cx = 0.4 + idx * stepW + stepW / 2;
          // Circle node
          slide.addShape(pres.shapes.OVAL, {
            x: cx - 0.28, y: 2.02, w: 0.56, h: 0.56,
            fill: { color: idx === 0 ? T.accent : T.bgAlt },
            line: { color: T.accent, pt: 2 },
          });
          // Step number
          slide.addText(String(idx + 1), {
            x: cx - 0.28, y: 2.02, w: 0.56, h: 0.56,
            fontSize: 13, bold: true,
            color: idx === 0 ? 'FFFFFF' : T.accent,
            align: 'center', valign: 'middle', margin: 0,
          });
          // Step text
          slide.addText(step, {
            x: cx - stepW / 2 + 0.05, y: 2.7, w: stepW - 0.1, h: 2.5,
            fontSize: 12, color: T.text, fontFace: 'Calibri',
            align: 'center', valign: 'top', margin: 0,
          });
          // Alternating dots above
          if (idx % 2 === 0) {
            slide.addShape(pres.shapes.OVAL, {
              x: cx - 0.05, y: 1.6, w: 0.1, h: 0.1,
              fill: { color: T.accent2 }, line: { color: T.accent2 },
            });
          }
        });

        addFooter(slide, title);
        break;
      }

      // ── AGENDA SLIDE ─────────────────────────────────────
      case 'agenda': {
        slide.background = { color: T.bg };
        // Title
        slide.addShape(pres.shapes.RECTANGLE, {
          x: 0, y: 0, w: 10, h: 0.85,
          fill: { color: T.bgAlt }, line: { color: T.bgAlt },
        });
        slide.addShape(pres.shapes.RECTANGLE, {
          x: 0, y: 0, w: 0.08, h: 0.85,
          fill: { color: T.accent }, line: { color: T.accent },
        });
        slide.addText(sd.title || 'Agenda', {
          x: 0.25, y: 0, w: 9.5, h: 0.85,
          fontSize: 22, bold: true, color: T.text, fontFace: 'Calibri', valign: 'middle', margin: 0,
        });

        const items = sd.body || [];
        const cardH = Math.min(0.7, 4.3 / items.length);
        items.slice(0, 7).forEach((item, idx) => {
          const oy = 1.0 + idx * (cardH + 0.1);
          accentCard(slide, 0.4, oy, 9.2, cardH, T.bgAlt);
          // Number circle
          slide.addShape(pres.shapes.OVAL, {
            x: 0.55, y: oy + cardH / 2 - 0.22, w: 0.44, h: 0.44,
            fill: { color: T.accent }, line: { color: T.accent },
          });
          slide.addText(String(idx + 1), {
            x: 0.55, y: oy + cardH / 2 - 0.22, w: 0.44, h: 0.44,
            fontSize: 12, bold: true, color: 'FFFFFF',
            align: 'center', valign: 'middle', margin: 0,
          });
          // Item text
          slide.addText(item, {
            x: 1.15, y: oy, w: 8.2, h: cardH,
            fontSize: 14, color: T.text, fontFace: 'Calibri',
            valign: 'middle', margin: 0,
          });
        });

        addFooter(slide, title);
        break;
      }

      // ── DEFAULT fallback ─────────────────────────────────
      default: {
        slide.background = { color: T.bg };
        slide.addText(sd.title || '', {
          x: 0.5, y: 0.5, w: 9, h: 1,
          fontSize: 28, bold: true, color: T.text, fontFace: 'Calibri',
        });
        const bodyItems = (sd.body || []).map((b, i) => ({
          text: b, options: { bullet: true, breakLine: i < (sd.body||[]).length-1, fontSize: 15, color: T.text, paraSpaceAfter: 8 },
        }));
        if (bodyItems.length) slide.addText(bodyItems, { x: 0.5, y: 1.7, w: 9, h: 3.5, valign: 'top' });
        addFooter(slide, title);
      }
    }
  }

  // ── Save & return URL ─────────────────────────────────────
  const safeFilename = filename.replace(/[^a-zA-Z0-9_-]/g, '_');
  const outPath = path.join(PUBLIC_DIR, `${safeFilename}.pptx`);
  await pres.writeFile({ fileName: outPath });

  const url = `https://api.heyjarvis.me/view/${safeFilename}.pptx`;
  console.log(`[PPTX] Saved: ${outPath}`);
  return `Presentation created! Download it here: ${url}`;
}

module.exports = { generatePresentation };