let pdfDoc = null,
        pages = [],
        currentIndex = 0;
      let tool = "draw",
        drawing = false,
        panning = false;
      let startX,
        startY,
        zoom = 1,
        panX = 0,
        panY = 0;
      let undoStack = [],
        redoStack = [];

      const pdfCanvas = document.getElementById("pdfCanvas");
      const pdfCtx = pdfCanvas.getContext("2d");
      const drawCanvas = document.getElementById("drawCanvas");
      const ctx = drawCanvas.getContext("2d");
      const viewer = document.getElementById("viewer");
      const colorPicker = document.getElementById("colorPicker");
      const brushSize = document.getElementById("brushSize");

      function resize() {
        drawCanvas.width = window.innerWidth;
        drawCanvas.height = window.innerHeight;
      }
      resize();
      window.addEventListener("resize", resize);

      function setTool(t) {
        tool = t;
      }

      function saveState() {
        undoStack.push(drawCanvas.toDataURL());
        redoStack = [];
      }

      function undo() {
        if (!undoStack.length) return;
        redoStack.push(drawCanvas.toDataURL());
        let img = new Image();
        img.src = undoStack.pop();
        img.onload = () => {
          ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
          ctx.drawImage(img, 0, 0);
        };
      }

      function redo() {
        if (!redoStack.length) return;
        undoStack.push(drawCanvas.toDataURL());
        let img = new Image();
        img.src = redoStack.pop();
        img.onload = () => {
          ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
          ctx.drawImage(img, 0, 0);
        };
      }

      // --- CENTRALIZED DRAWING LOGIC ---

      function startAction(x, y) {
        if (tool === "pan") {
          panning = true;
          startX = x;
          startY = y;
          return;
        }
        saveState();
        drawing = true;
        startX = x;
        startY = y;
        ctx.beginPath();
        ctx.moveTo(startX, startY);
      }

      function moveAction(x, y, movementX, movementY) {
        if (panning) {
          panX += movementX;
          panY += movementY;
          viewer.style.transform = `translate(${panX}px,${panY}px) scale(${zoom})`;
          return;
        }
        if (!drawing) return;

        // Tools that draw "live" (freehand)
        if (tool === "draw" || tool === "highlight" || tool === "erase") {
          ctx.lineCap = "round";
          if (tool === "highlight") {
            ctx.lineWidth = brushSize.value * 7;
            ctx.globalAlpha = 0.05;
          } else {
            ctx.lineWidth = brushSize.value;
            ctx.globalAlpha = 1;
          }

          if (tool === "erase") {
            ctx.globalCompositeOperation = "destination-out";
            ctx.lineWidth = brushSize.value * 11;
          } else {
            ctx.globalCompositeOperation = "source-over";
            ctx.strokeStyle = colorPicker.value;
          }

          ctx.lineTo(x, y);
          ctx.stroke();
          // For freehand, we update start points to keep the line smooth
          startX = x;
          startY = y;
        }
      }

      function endAction(x, y) {
        if (!drawing) {
          panning = false;
          return;
        }

        ctx.strokeStyle = colorPicker.value;
        ctx.lineWidth = brushSize.value;
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";

        // Tools that draw only when you let go (Shapes)
        if (tool === "rect") {
          ctx.strokeRect(startX, startY, x - startX, y - startY);
        } else if (tool === "circle") {
    // Calculate distance between start and end points
    let d = Math.hypot(x - startX, y - startY);

    // Treat the distance as the diameter, so radius is half
    let r = d / 2;

    // Calculate the center of the circle (midpoint between start and end)
    let centerX = (startX + x) / 2;
    let centerY = (startY + y) / 2;

    ctx.beginPath();
    ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
    ctx.stroke();
}
         else if (tool === "line") {
          ctx.beginPath();
          ctx.moveTo(startX, startY);
          ctx.lineTo(x, y);
          ctx.stroke();
        } else if (tool === "arrow") {
          const headLen = 15;
          const dx = x - startX;
          const dy = y - startY;
          const angle = Math.atan2(dy, dx);
          ctx.beginPath();
          ctx.moveTo(startX, startY);
          ctx.lineTo(x, y);
          ctx.moveTo(
            x - headLen * Math.cos(angle - Math.PI / 6),
            y - headLen * Math.sin(angle - Math.PI / 6),
          );
          ctx.lineTo(x, y);
          ctx.lineTo(
            x - headLen * Math.cos(angle + Math.PI / 6),
            y - headLen * Math.sin(angle + Math.PI / 6),
          );
          ctx.stroke();
        }

        drawing = false;
        panning = false;
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      }

      // --- MOUSE EVENTS ---
      drawCanvas.addEventListener("mousedown", (e) =>
        startAction(e.clientX, e.clientY),
      );
      drawCanvas.addEventListener("mousemove", (e) =>
        moveAction(e.clientX, e.clientY, e.movementX, e.movementY),
      );
      drawCanvas.addEventListener("mouseup", (e) =>
        endAction(e.clientX, e.clientY),
      );

      // --- TOUCH EVENTS ---
  let isTouchActive = false;

drawCanvas.addEventListener("touchstart", (e) => {
  e.preventDefault();

  // ❌ ignore multi-touch
  if (e.touches.length > 1) return;

  if (isTouchActive) return; // prevent duplicate start
  isTouchActive = true;

  const t = e.touches[0];

  tool = "erase"; // keep your logic

  startX = t.clientX;
  startY = t.clientY;

  startAction(startX, startY);
}, { passive: false });


drawCanvas.addEventListener("touchmove", (e) => {
  e.preventDefault();

  // ❌ ignore multi-touch
  if (e.touches.length > 1) return;

  if (!isTouchActive) return;

  const t = e.touches[0];

  const movX = t.clientX - startX;
  const movY = t.clientY - startY;

  moveAction(t.clientX, t.clientY, movX, movY);

  // update for smooth movement
  startX = t.clientX;
  startY = t.clientY;

}, { passive: false });


drawCanvas.addEventListener("touchend", (e) => {
  e.preventDefault();

  if (!isTouchActive) return;

  const t = e.changedTouches[0];

  endAction(t.clientX, t.clientY);

  isTouchActive = false;

}, { passive: false }); // 


      // --- PDF & UI LOGIC ---
      function clearCanvas() {
        ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
      }
      function zoomIn() {
        zoom += 0.1;
        viewer.style.transform = `translate(${panX}px,${panY}px) scale(${zoom})`;
      }
      function zoomOut() {
        zoom = Math.max(0.4, zoom - 0.1);
        viewer.style.transform = `translate(${panX}px,${panY}px) scale(${zoom})`;
      }
      function fit() {
        zoom = 1;
        panX = 0;
        panY = 0;
        viewer.style.transform = "translate(0,0) scale(1)";
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
              for (let i = 1; i <= pdf.numPages; i++)
                pages.push({ type: "pdf", num: i });
              currentIndex = 0;
              renderPage();
            });
        };
        reader.readAsArrayBuffer(file);
      });

      function renderPage() {
        clearCanvas();
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

      function addBlankPage() {
        pages.splice(currentIndex + 1, 0, { type: "blank" });
        currentIndex++;
        renderPage();
      }
      function removePage() {
        if (pages.length <= 1) return;
        pages.splice(currentIndex, 1);
        if (currentIndex >= pages.length) currentIndex = pages.length - 1;
        renderPage();
      }
      function nextPage() {
        if (currentIndex < pages.length - 1) {
          currentIndex++;
          renderPage();
        }
      }
      function prevPage() {
        if (currentIndex > 0) {
          currentIndex--;
          renderPage();
        }
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

      function togglePDFLibrary(){
  const menu = document.getElementById("pdfLibrary");

  if(menu.style.display === "flex"){
    menu.style.display = "none";
  }else{
    menu.style.display = "flex";
  }
}


function loadWebsitePDF(url){
  
  pdfjsLib.getDocument(url).promise.then((pdf)=>{
    
    pdfDoc = pdf;
    pages = [];
    
    for(let i=1;i<=pdf.numPages;i++){
      pages.push({type:"pdf",num:i});
    }
    
    currentIndex = 0;
    
    renderPage();
    
    // hide the PDF menu after selecting
    document.getElementById("pdfLibrary").style.display = "none";
    
  });
  
}

// already work

let pageDrawings = [];

function saveCurrentCanvas(){
  pageDrawings[currentIndex] = drawCanvas.toDataURL();
}

function nextPage(){
  if(currentIndex < pages.length-1){
    saveCurrentCanvas();       // save current page drawing
    currentIndex++;
    renderPage();
    restoreCanvas();           // restore next page drawing
  }
}

function prevPage(){
  if(currentIndex > 0){
    saveCurrentCanvas();       // save current page drawing
    currentIndex--;
    renderPage();
    restoreCanvas();           // restore previous page drawing
  }
}

function restoreCanvas(){
  ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
  if(pageDrawings[currentIndex]){
    let img = new Image();
    img.src = pageDrawings[currentIndex];
    img.onload = ()=>{ ctx.drawImage(img, 0, 0); }
  }
}

function addBlankPage(){
  saveCurrentCanvas(); // save current page
  pages.splice(currentIndex+1, 0, {type:"blank"});
  currentIndex++;
  renderPage();
  restoreCanvas();     // start with empty drawing
}

// add next page
function saveCurrentCanvas() {
    pageDrawings[currentIndex] = drawCanvas.toDataURL();
}

function restoreCanvas() {
    ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    if(pageDrawings[currentIndex]){
        let img = new Image();
        img.src = pageDrawings[currentIndex];
        img.onload = () => ctx.drawImage(img, 0, 0);
    }
}


function nextPage() {
    saveCurrentCanvas();

    // If at last page, add a new blank page automatically
    if (currentIndex >= pages.length - 1) {
        pages.push({ type: "blank" });
    }

    currentIndex++;
    renderPage();
    restoreCanvas();
}

function prevPage() {
    if (currentIndex > 0) {
        saveCurrentCanvas();
        currentIndex--;
        renderPage();
        restoreCanvas();
    }
}

function addBlankPage() {
    saveCurrentCanvas();
    pages.splice(currentIndex + 1, 0, { type: "blank" });
    currentIndex++;
    renderPage();
    restoreCanvas();
}


window.onload = function () {
  const url = "black_pages_landscape.pdf"; // local file inside project

  pdfjsLib.getDocument(url).promise.then((pdf) => {
    pdfDoc = pdf;
    pages = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      pages.push({ type: "pdf", num: i });
    }
    
    currentIndex = 0;
    renderPage();
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
