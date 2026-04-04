let pdfDoc = null,
        pages = [],
        currentIndex = 0;

      const pdfCanvas = document.getElementById("pdfCanvas");
      const pdfCtx = pdfCanvas.getContext("2d");



const activeTouches = new Map();

// Pan/zoom state
let panX = 0,
  panY = 0,
  zoom = 1,
  panning = false,
  startX = 0,
  startY = 0;

// Tool state
let tool = "draw"; // draw, erase, highlight, rect, circle, line, arrow, pan

// Canvas
const drawCanvas = document.getElementById("drawCanvas");
const ctx = drawCanvas.getContext("2d");
const viewer = document.getElementById("viewer");
const colorPicker = document.getElementById("colorPicker");
const brushSize = document.getElementById("brushSize");

// Undo/redo stacks
const undoStack = [];
const redoStack = [];

// Per-page history
const pageStrokes = [];
const pageRedoStacks = [];

// Resize canvas
function resize() {
  drawCanvas.width = window.innerWidth;
  drawCanvas.height = window.innerHeight;
}
resize();
window.addEventListener("resize", resize);

// --- Helper: redraw all strokes ---
function redraw(strokes) {
  ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
  for (let s of strokes) {
    ctx.lineCap = "round";

    if (s.tool === "erase") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.lineWidth = s.width * 2;
    } else if (s.tool === "highlight") {
      ctx.globalCompositeOperation = "source-over";
      ctx.lineWidth = s.width * 5;
      ctx.globalAlpha = 0.3;
      ctx.strokeStyle = s.color;
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.lineWidth = s.width;
      ctx.globalAlpha = 1;
      ctx.strokeStyle = s.color;
    }

    if (s.tool === "draw" || s.tool === "erase" || s.tool === "highlight") {
      ctx.beginPath();
      ctx.moveTo(s.path[0].x, s.path[0].y);
      for (let i = 1; i < s.path.length; i++) {
        ctx.lineTo(s.path[i].x, s.path[i].y);
      }
      ctx.stroke();
    } else if (s.tool === "rect") {
  // Calculate top-left and width/height dynamically
  const x = Math.min(s.shape.x1, s.shape.x2);
  const y = Math.min(s.shape.y1, s.shape.y2);
  const w = Math.abs(s.shape.x2 - s.shape.x1);
  const h = Math.abs(s.shape.y2 - s.shape.y1);

  ctx.beginPath();
  ctx.strokeRect(x, y, w, h);
  ctx.stroke();

    } else if (s.tool === "circle") {
      const { cx, cy, r } = s.shape;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    } else if (s.tool === "line") {
      const { x1, y1, x2, y2 } = s.shape;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    } else if (s.tool === "arrow") {
      const { x1, y1, x2, y2 } = s.shape;
      const headLen = 15;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const angle = Math.atan2(dy, dx);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.moveTo(
        x2 - headLen * Math.cos(angle - Math.PI / 6),
        y2 - headLen * Math.sin(angle - Math.PI / 6),
      );
      ctx.lineTo(x2, y2);
      ctx.lineTo(
        x2 - headLen * Math.cos(angle + Math.PI / 6),
        y2 - headLen * Math.sin(angle + Math.PI / 6),
      );
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }
}

function cloneStroke(stroke) {
  return {
    tool: stroke.tool,
    color: stroke.color,
    width: stroke.width,
    path: stroke.path ? stroke.path.map((p) => ({ x: p.x, y: p.y })) : null,
    shape: stroke.shape ? { ...stroke.shape } : null,
  };
}

function saveCurrentPageState() {
  pageStrokes[currentIndex] = undoStack.map(cloneStroke);
  pageRedoStacks[currentIndex] = redoStack.map(cloneStroke);
}

function loadCurrentPageState() {
  undoStack.length = 0;
  redoStack.length = 0;
  if (Array.isArray(pageStrokes[currentIndex])) {
    for (const stroke of pageStrokes[currentIndex]) undoStack.push(cloneStroke(stroke));
  }
  if (Array.isArray(pageRedoStacks[currentIndex])) {
    for (const stroke of pageRedoStacks[currentIndex]) redoStack.push(cloneStroke(stroke));
  }
  redraw(undoStack);
}

// --- TOUCH START ---
drawCanvas.addEventListener(
  "touchstart",
  (e) => {
    e.preventDefault();
    for (let t of e.changedTouches) {
      if (tool !== "pan") {
        // Each stroke stores its tool, color, width
        const stroke = {
          tool,
          color: colorPicker.value,
          width: brushSize.value,
          path:
            tool === "draw" || tool === "erase" || tool === "highlight"
              ? [{ x: t.clientX, y: t.clientY }]
              : [],
          shape:
            tool !== "draw" && tool !== "erase" && tool !== "highlight"
              ? { x1: t.clientX, y1: t.clientY, x2: t.clientX, y2: t.clientY }
              : null,
        };
        activeTouches.set(t.identifier, stroke);
      }

      if (tool === "pan") {
        panning = true;
        startX = t.clientX;
        startY = t.clientY;
      }
    }

    // Ensure active strokes are visible immediately
    // if (activeTouches.size > 0 && !redrawScheduled) {
    //   redrawScheduled = true;
    //   requestAnimationFrame(() => {
    //     redraw([...undoStack, ...Array.from(activeTouches.values())]);
    //     redrawScheduled = false;
    //   });
    // } //changes addded 04
  },
  { passive: false },
);

// --- TOUCH MOVE ---
let redrawScheduled = false;
drawCanvas.addEventListener(
  "touchmove",
  (e) => {
    e.preventDefault();

    if (tool === "pan" && panning) {
      const t = e.changedTouches[0];
      const lastX = startX;
      const lastY = startY;
      panX += t.clientX - lastX;
      panY += t.clientY - lastY;
      startX = t.clientX;
      startY = t.clientY;
      applyTransform();
      return;
    }

    let needsRedraw = false;
    for (let t of e.changedTouches) {
      const stroke = activeTouches.get(t.identifier);
      if (!stroke) continue;

      if (
        stroke.tool === "draw" ||
        stroke.tool === "erase" ||
        stroke.tool === "highlight"
      ) {
        stroke.path.push({ x: t.clientX, y: t.clientY });
        needsRedraw = true;
      } else {
        // Update shape coordinates dynamically
        stroke.shape.x2 = t.clientX;
        stroke.shape.y2 = t.clientY;
        if (stroke.tool === "circle") {
          const dx = stroke.shape.x2 - stroke.shape.x1;
          const dy = stroke.shape.y2 - stroke.shape.y1;
          stroke.shape.cx = (stroke.shape.x1 + stroke.shape.x2) / 2;
          stroke.shape.cy = (stroke.shape.y1 + stroke.shape.y2) / 2;
          stroke.shape.r = Math.hypot(dx, dy) / 2;
        }
        needsRedraw = true;
      }
    }

    if (needsRedraw && !redrawScheduled) {
  redrawScheduled = true;

  requestAnimationFrame(() => {
    redraw([...undoStack, ...Array.from(activeTouches.values())]);
    redrawScheduled = false;
  });
}//cHanges aDded 03
  },
  { passive: false },
);

// --- TOUCH END ---
drawCanvas.addEventListener(
  "touchend",
  (e) => {
    e.preventDefault();

    if (tool === "pan") {
      panning = false;
      return;
    }

    for (let t of e.changedTouches) {
      const stroke = activeTouches.get(t.identifier);
      if (!stroke) continue;

      // Only add meaningful strokes to undo stack
      let shouldAdd = true;
      if (stroke.tool === "draw" || stroke.tool === "erase" || stroke.tool === "highlight") {
        if (stroke.path.length <= 1) shouldAdd = false;
      } else {
        if (stroke.shape.x1 === stroke.shape.x2 && stroke.shape.y1 === stroke.shape.y2) shouldAdd = false;
      }

      if (shouldAdd) {
        undoStack.push(stroke);
        redoStack.length = 0;
      }

      activeTouches.delete(t.identifier);
    }

    // Schedule redraw to include completed and active strokes
    if (!redrawScheduled) {
      redrawScheduled = true;
      requestAnimationFrame(() => {
        redraw(undoStack);//cHanges aDded 02
        redrawScheduled = false;
      });
    }
  },
  { passive: false },
);

// --- MOUSE PAN ---
drawCanvas.addEventListener("mousedown", (e) => {
  if (tool === "pan") {
    panning = true;
    startX = e.clientX;
    startY = e.clientY;
    drawCanvas.style.cursor = "grabbing";
    e.preventDefault();
  }
});

drawCanvas.addEventListener("mousemove", (e) => {
  if (tool === "pan" && panning) {
    panX += e.clientX - startX;
    panY += e.clientY - startY;
    startX = e.clientX;
    startY = e.clientY;
    applyTransform();
    e.preventDefault();
  }
});

drawCanvas.addEventListener("mouseup", () => {
  if (tool === "pan") {
    panning = false;
    drawCanvas.style.cursor = "grab";
  }
});

drawCanvas.addEventListener("mouseleave", () => {
  if (tool === "pan") panning = false;
});

// --- UNDO ---
function undo() {
  if (!undoStack.length) return;
  const lastStroke = undoStack.pop();
  redoStack.push(lastStroke);
  redraw(undoStack);
}

// --- REDO ---
function redo() {
  if (!redoStack.length) return;
  const stroke = redoStack.pop();
  undoStack.push(stroke);
  redraw(undoStack);
}

// --- TOOL SELECTION ---
function setTool(t) {
  tool = t;
  if (tool === "pan") {
    drawCanvas.style.cursor = "grab";
  } else {
    drawCanvas.style.cursor = "crosshair";
  }
}

function applyTransform() {
  const transform = `translate(${panX}px,${panY}px) scale(${zoom})`;
  viewer.style.transform = transform;
  // drawCanvas remains fixed at full-window overlay so drawn content is stable on the screen
}

   // --- PDF & UI LOGIC ---
      function clearDrawCanvas() {
        ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
      }

      function clearCanvas() {
        clearDrawCanvas();
        undoStack.length = 0;
        redoStack.length = 0;
        pageStrokes[currentIndex] = [];
      }
      function zoomIn() {
        zoom += 0.1;
        applyTransform();
      }
      function zoomOut() {
        zoom = Math.max(0.4, zoom - 0.1);
        applyTransform();
      }
      function fit() {
        zoom = 1;
        panX = 0;
        panY = 0;
        applyTransform();
      }

      document.getElementById("fileInput").addEventListener("change", (e) => {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = function () {
          pdfjsLib
            .getDocument(new Uint8Array(this.result))
            .promise.then((pdf) => {
              pdfDoc = pdf;
              pages = [];
              pageStrokes.length = 0;
              pageRedoStacks.length = 0;
              for (let i = 1; i <= pdf.numPages; i++) {
                pages.push({ type: "pdf", num: i });
                pageStrokes.push([]);
                pageRedoStacks.push([]);
              }
              currentIndex = 0;
              renderPage();
              loadCurrentPageState();
            });
        };
        reader.readAsArrayBuffer(file);
      });

      function renderPage() {
        clearDrawCanvas();
        let page = pages[currentIndex];
        if (page.type === "blank") {
          pdfCanvas.width = 900;
          pdfCanvas.height = 1200;
          pdfCtx.fillStyle = "white";
          pdfCtx.fillRect(0, 0, 900, 1200);
        } else {
          pdfDoc.getPage(page.num).then((p) => {
            let viewport = p.getViewport({ scale: 1 });
            pdfCanvas.width = viewport.width;
            pdfCanvas.height = viewport.height;
            p.render({ canvasContext: pdfCtx, viewport: viewport });
          });
        }
        document.getElementById("pageInfo").textContent =
          `Page ${currentIndex + 1} / ${pages.length}`;
      }

      let colorPaletteVisible = false;
      function toggleColorPalette() {
        const palette = document.getElementById("colorPalette");
        colorPaletteVisible = !colorPaletteVisible;
        palette.style.display = colorPaletteVisible ? "flex" : "none";
      }
      function selectColor(c) {
        document.getElementById("mainColorBtn").style.background = c;
        document.getElementById("colorPicker").value = c;
        toggleColorPalette();
      }

      // changes added

      function togglePDFLibrary() {
        const menu = document.getElementById("pdfLibrary");
        if (menu.style.display === "flex") {
          menu.style.display = "none";
        } else {
          menu.style.display = "flex";
        }
      }

      function loadWebsitePDF(url) {
        pdfjsLib.getDocument(url).promise.then((pdf) => {
          pdfDoc = pdf;
          pages = [];
          pageStrokes.length = 0;
          pageRedoStacks.length = 0;

          for (let i = 1; i <= pdf.numPages; i++) {
            pages.push({ type: "pdf", num: i });
            pageStrokes.push([]);
            pageRedoStacks.push([]);
          }

          currentIndex = 0;
          clearDrawCanvas();
          undoStack.length = 0;
          redoStack.length = 0;

          renderPage();
          loadCurrentPageState();

          document.getElementById("pdfLibrary").style.display = "none";
        });
      }


function nextPage() {
  saveCurrentPageState();
  if (currentIndex >= pages.length - 1) {
    pages.push({ type: "blank" });
  }
  currentIndex++;
  renderPage();
  loadCurrentPageState();
}

function prevPage() {
  if (currentIndex <= 0) return;
  saveCurrentPageState();
  currentIndex--;
  renderPage();
  loadCurrentPageState();
}

function removePage() {
  if (pages.length <= 1) return;

  saveCurrentPageState();
  pages.splice(currentIndex, 1);
  pageStrokes.splice(currentIndex, 1);
  pageRedoStacks.splice(currentIndex, 1);

  if (currentIndex >= pages.length) {
    currentIndex = pages.length - 1;
  }

  renderPage();
  loadCurrentPageState();
}

function addBlankPage() {
  saveCurrentPageState();
  pages.splice(currentIndex + 1, 0, { type: "blank" });
  pageStrokes.splice(currentIndex + 1, 0, []);
  pageRedoStacks.splice(currentIndex + 1, 0, []);
  currentIndex++;
  renderPage();
  loadCurrentPageState();
}

window.onload = function () {
  const url = "black_pages_landscapde.pdf"; // local file inside project

  pdfjsLib.getDocument(url).promise.then((pdf) => {
    pdfDoc = pdf;
    pages = [];
    pageStrokes.length = 0;
    pageRedoStacks.length = 0;

    for (let i = 1; i <= pdf.numPages; i++) {
      pages.push({ type: "pdf", num: i });
      pageStrokes.push([]);
      pageRedoStacks.push([]);
    }
    
    currentIndex = 0;
    renderPage();
    loadCurrentPageState();
  });
};

// some new change

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    // Enter fullscreen
    document.documentElement.requestFullscreen();
    document.getElementById("fsBtn").innerText = "💢";
  } else {
    // Exit fullscreen
    document.exitFullscreen();
    document.getElementById("fsBtn").innerText = "⛶";
  }
}

    //date and time added
    function updateDateTime() {
      const now = new Date();

      // --- Time (HH:MM:SS)
      let hours = String(now.getHours()).padStart(2, '0');
      let minutes = String(now.getMinutes()).padStart(2, '0');
      document.getElementById('timeDisplay').innerText = `${hours}:${minutes}`;

      // --- Date (Short format: Fri, 19 Mar)
      const options = { weekday: 'short', day: 'numeric', month: 'short' };
      document.getElementById('dateDisplay').innerText = now.toLocaleDateString('en-IN', options);
    }

    // Update every second
    updateDateTime();
    setInterval(updateDateTime, 1000);


    
