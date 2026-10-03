(function () {
  "use strict";

  const LANES = [
    { id: "left", key: "ArrowLeft", symbol: "←", className: "lane-left" },
    { id: "down", key: "ArrowDown", symbol: "↓", className: "lane-down" },
    { id: "up", key: "ArrowUp", symbol: "↑", className: "lane-up" },
    { id: "right", key: "ArrowRight", symbol: "→", className: "lane-right" },
  ];

  const JUDGMENTS = [
    { name: "Perfect", window: 0.07, points: 1000, life: 4 },
    { name: "Great", window: 0.13, points: 650, life: 2 },
    { name: "Good", window: 0.2, points: 300, life: 0.5 },
  ];

  const MISS_WINDOW = 0.22;
  const APPROACH_TIME = 1.85;
  const STAGE_LENGTH = 75;
  const START_LIFE = 70;
  const STORAGE_KEY = "neon-step-district-best-result";
  const autoplay = new URLSearchParams(window.location.search).get("autoplay") === "1";

  const els = {
    playfield: document.getElementById("playfield"),
    receptors: document.getElementById("receptors"),
    steps: document.getElementById("steps"),
    overlay: document.getElementById("overlay"),
    overlayTitle: document.getElementById("overlayTitle"),
    overlayBody: document.getElementById("overlayBody"),
    startButton: document.getElementById("startButton"),
    flash: document.getElementById("judgmentFlash"),
    lifeFill: document.getElementById("lifeFill"),
    lifeValue: document.getElementById("lifeValue"),
    scoreValue: document.getElementById("scoreValue"),
    comboValue: document.getElementById("comboValue"),
    bestValue: document.getElementById("bestValue"),
    timeValue: document.getElementById("timeValue"),
    progressFill: document.getElementById("progressFill"),
    perfectCount: document.getElementById("perfectCount"),
    greatCount: document.getElementById("greatCount"),
    goodCount: document.getElementById("goodCount"),
    missCount: document.getElementById("missCount"),
  };

  let chart = [];
  let audio = null;
  let state = "ready";
  let countdownValue = 3;
  let countdownTimer = 0;
  let stageStartTime = 0;
  let pausedAt = 0;
  let pausedTotal = 0;
  let rafId = 0;
  let life = START_LIFE;
  let score = 0;
  let combo = 0;
  let maxCombo = 0;
  let counts = { Perfect: 0, Great: 0, Good: 0, Miss: 0 };
  let renderedSteps = new Map();
  let bestResult = readBestResult();

  function createChart() {
    const patternA = [0, 1, 2, 3, 1, 0, 3, 2];
    const patternB = [0, 2, 1, 3, 0, 1, 3, 2, 2, 1, 3, 0];
    const notes = [];

    for (let t = 4, i = 0; t < 34; t += 0.74, i += 1) {
      notes.push(step(t, patternA[i % patternA.length]));
    }

    for (let t = 34, i = 0; t < 58; t += 0.56, i += 1) {
      notes.push(step(t, patternB[i % patternB.length]));
      if (i % 8 === 5) notes.push(step(t + 0.28, (patternB[i % patternB.length] + 2) % 4));
    }

    for (let t = 58, i = 0; t < 72; t += 0.46, i += 1) {
      notes.push(step(t, patternB[(i * 3) % patternB.length]));
      if (i % 6 === 2) notes.push(step(t + 0.23, (i + 1) % 4));
    }

    return notes.sort((a, b) => a.time - b.time);
  }

  function step(time, lane) {
    return { id: `${time.toFixed(2)}-${lane}-${Math.random().toString(36).slice(2)}`, time, lane, hit: false, missed: false };
  }

  function init() {
    chart = createChart();
    LANES.forEach((lane) => {
      const receptor = document.createElement("div");
      receptor.className = `receptor ${lane.className}`;
      receptor.textContent = lane.symbol;
      receptor.dataset.lane = String(LANES.indexOf(lane));
      els.receptors.appendChild(receptor);
    });
    updateBestResult();
    updateHud();
    els.startButton.addEventListener("click", handlePrimaryButton);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("blur", () => {
      if (state === "playing") pauseStage();
    });
    if (autoplay) {
      els.overlayBody.textContent = "Autoplay is active from the query string. Start the stage to verify chart timing.";
    }
  }

  function startCountdown() {
    stopAudio();
    clearStage();
    audio = makeTrack();
    audio.context.resume();
    state = "countdown";
    countdownValue = 3;
    countdownTimer = performance.now();
    els.overlay.classList.remove("hidden");
    els.overlayTitle.textContent = "3";
    els.overlayBody.textContent = "Get ready.";
    els.startButton.textContent = "Starting";
    els.startButton.disabled = true;
    rafId = requestAnimationFrame(tick);
  }

  function handlePrimaryButton() {
    if (state === "paused") resumeStage();
    else startCountdown();
  }

  function clearStage() {
    chart = createChart();
    renderedSteps.forEach((node) => node.remove());
    renderedSteps = new Map();
    life = START_LIFE;
    score = 0;
    combo = 0;
    maxCombo = 0;
    counts = { Perfect: 0, Great: 0, Good: 0, Miss: 0 };
    pausedAt = 0;
    pausedTotal = 0;
    updateHud();
    setFlash("Ready");
  }

  function beginStage(now) {
    state = "playing";
    stageStartTime = now / 1000;
    pausedTotal = 0;
    els.overlay.classList.add("hidden");
    els.startButton.disabled = false;
    els.startButton.textContent = "Retry Stage";
    audio.start();
  }

  function tick(now) {
    if (state === "countdown") {
      const elapsed = (now - countdownTimer) / 1000;
      const next = Math.max(0, 3 - Math.floor(elapsed));
      if (next !== countdownValue) {
        countdownValue = next;
        els.overlayTitle.textContent = countdownValue > 0 ? String(countdownValue) : "Dance";
        els.overlayBody.textContent = countdownValue > 0 ? "Find the beat." : "Hit the receptors.";
      }
      if (elapsed >= 3.75) beginStage(now);
    }

    if (state === "playing") {
      const songTime = getSongTime(now);
      updateBeatPulse(songTime);
      if (autoplay) autoplayHits(songTime);
      markLateMisses(songTime);
      renderSteps(songTime);
      updateHud(songTime);
      if (life <= 0) finishStage(false);
      if (songTime >= STAGE_LENGTH) finishStage(true);
    }

    rafId = requestAnimationFrame(tick);
  }

  function getSongTime(now) {
    return now / 1000 - stageStartTime - pausedTotal;
  }

  function handleKeyDown(event) {
    const laneIndex = LANES.findIndex((lane) => lane.key === event.key);
    if (event.code === "Space") {
      event.preventDefault();
      if (state === "playing") pauseStage();
      else if (state === "paused") resumeStage();
      return;
    }
    if (laneIndex === -1 || state !== "playing" || autoplay) return;
    event.preventDefault();
    judgeLane(laneIndex, currentSongTime());
  }

  function currentSongTime() {
    return performance.now() / 1000 - stageStartTime - pausedTotal;
  }

  function judgeLane(laneIndex, songTime) {
    const candidate = chart
      .filter((item) => item.lane === laneIndex && !item.hit && !item.missed)
      .map((item) => ({ item, delta: Math.abs(item.time - songTime) }))
      .filter((entry) => entry.delta <= MISS_WINDOW)
      .sort((a, b) => a.delta - b.delta)[0];

    pulseReceptor(laneIndex);
    if (!candidate) {
      setFlash("Miss");
      applyMiss();
      return;
    }

    const result = JUDGMENTS.find((judgment) => candidate.delta <= judgment.window);
    if (!result) {
      candidate.item.missed = true;
      setFlash("Miss");
      applyMiss();
      return;
    }

    candidate.item.hit = true;
    removeStep(candidate.item.id);
    counts[result.name] += 1;
    combo += 1;
    maxCombo = Math.max(maxCombo, combo);
    score += result.points + combo * 5;
    life = clamp(life + result.life, 0, 100);
    setFlash(result.name);
    updateHud(songTime);
  }

  function autoplayHits(songTime) {
    chart.forEach((item) => {
      if (!item.hit && !item.missed && Math.abs(item.time - songTime) <= 0.018) {
        judgeLane(item.lane, item.time);
      }
    });
  }

  function markLateMisses(songTime) {
    chart.forEach((item) => {
      if (!item.hit && !item.missed && songTime - item.time > MISS_WINDOW) {
        item.missed = true;
        removeStep(item.id);
        applyMiss();
      }
    });
  }

  function applyMiss() {
    counts.Miss += 1;
    combo = 0;
    life = clamp(life - 8, 0, 100);
    updateHud(currentSongTime());
  }

  function renderSteps(songTime) {
    const playfieldHeight = els.playfield.clientHeight;
    const receptorY = playfieldHeight * 0.09 + 37;
    const spawnY = playfieldHeight + 60;
    chart.forEach((item) => {
      if (item.hit || item.missed) return;
      const untilHit = item.time - songTime;
      if (untilHit > APPROACH_TIME || untilHit < -MISS_WINDOW) return;

      let node = renderedSteps.get(item.id);
      if (!node) {
        node = document.createElement("div");
        node.className = `step ${LANES[item.lane].className}`;
        node.textContent = LANES[item.lane].symbol;
        node.style.left = `${item.lane * 25}%`;
        els.steps.appendChild(node);
        renderedSteps.set(item.id, node);
      }
      const progress = 1 - untilHit / APPROACH_TIME;
      const top = spawnY + (receptorY - spawnY) * progress;
      node.style.top = `${top}px`;
    });
  }

  function removeStep(id) {
    const node = renderedSteps.get(id);
    if (node) node.remove();
    renderedSteps.delete(id);
  }

  function updateHud(songTime = 0) {
    els.lifeFill.style.width = `${life}%`;
    els.lifeValue.textContent = `${Math.round(life)}%`;
    els.scoreValue.textContent = String(score);
    els.comboValue.textContent = String(combo);
    els.perfectCount.textContent = String(counts.Perfect);
    els.greatCount.textContent = String(counts.Great);
    els.goodCount.textContent = String(counts.Good);
    els.missCount.textContent = String(counts.Miss);
    els.timeValue.textContent = formatTime(Math.min(STAGE_LENGTH, Math.max(0, songTime)));
    els.progressFill.style.width = `${clamp((songTime / STAGE_LENGTH) * 100, 0, 100)}%`;
    if (life < 25) els.lifeFill.style.background = "linear-gradient(90deg, #ff4f5e, #ff9f1c)";
    else els.lifeFill.style.background = "linear-gradient(90deg, #ff4f5e, #ffd166, #63ff95)";
  }

  function updateBestResult() {
    els.bestValue.textContent = bestResult ? `${bestResult.grade} ${bestResult.score}` : "None";
  }

  function pauseStage() {
    if (state !== "playing") return;
    state = "paused";
    pausedAt = performance.now() / 1000;
    audio.pause();
    els.overlay.classList.remove("hidden");
    els.overlayTitle.textContent = "Paused";
    els.overlayBody.textContent = "Press Space to resume the stage without losing your place.";
    els.startButton.textContent = "Resume";
    els.startButton.disabled = false;
  }

  function resumeStage() {
    if (state !== "paused") return;
    pausedTotal += performance.now() / 1000 - pausedAt;
    state = "playing";
    audio.resume();
    els.overlay.classList.add("hidden");
    els.startButton.textContent = "Retry Stage";
  }

  function finishStage(cleared) {
    if (state !== "playing") return;
    state = "finished";
    cancelAnimationFrame(rafId);
    stopAudio();
    const grade = makeGrade(cleared);
    const improved = saveBestResult(grade);
    els.overlay.classList.remove("hidden");
    els.overlayTitle.textContent = cleared ? `Stage Clear: ${grade}` : `Stage Failed: ${grade}`;
    els.overlayBody.innerHTML = [
      `Score ${score} · Max combo ${maxCombo}`,
      `Perfect ${counts.Perfect} · Great ${counts.Great} · Good ${counts.Good} · Miss ${counts.Miss}`,
      improved ? "New best result saved locally." : "Best result remains unbeaten.",
    ].join("<br>");
    els.startButton.textContent = "Retry Stage";
    els.startButton.disabled = false;
    updateBestResult();
  }

  function makeGrade(cleared) {
    const total = counts.Perfect + counts.Great + counts.Good + counts.Miss || 1;
    const weighted = (counts.Perfect * 1 + counts.Great * 0.72 + counts.Good * 0.38) / total;
    if (!cleared) return weighted > 0.55 ? "C" : "D";
    if (weighted >= 0.94) return "S";
    if (weighted >= 0.84) return "A";
    if (weighted >= 0.72) return "B";
    if (weighted >= 0.58) return "C";
    return "D";
  }

  function saveBestResult(grade) {
    const next = { score, grade, maxCombo };
    if (!bestResult || score > bestResult.score) {
      bestResult = next;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return true;
    }
    return false;
  }

  function readBestResult() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY));
    } catch (_error) {
      return null;
    }
  }

  function setFlash(text) {
    els.flash.textContent = text;
    els.flash.classList.add("show");
    window.clearTimeout(setFlash.timer);
    setFlash.timer = window.setTimeout(() => els.flash.classList.remove("show"), 260);
  }

  function pulseReceptor(laneIndex) {
    const node = els.receptors.children[laneIndex];
    node.classList.add("active");
    window.setTimeout(() => node.classList.remove("active"), 120);
  }

  function updateBeatPulse(songTime) {
    const onBeat = Math.abs((songTime * 2) % 1) < 0.08;
    document.body.classList.toggle("beat", onBeat);
  }

  function makeTrack() {
    const context = new (window.AudioContext || window.webkitAudioContext)();
    const master = context.createGain();
    master.gain.value = 0.55;
    master.connect(context.destination);
    const nodes = [];
    let started = false;

    function schedule() {
      const base = context.currentTime + 0.04;
      const bpm = 132;
      const beat = 60 / bpm;
      const scale = [220, 246.94, 277.18, 329.63, 369.99, 415.3, 493.88, 554.37];
      for (let i = 0; i < STAGE_LENGTH / beat; i += 1) {
        const t = base + i * beat;
        drum(t, "kick");
        if (i % 2 === 1) drum(t, "snare");
        hat(t + beat / 2);
        if (i % 4 === 0) bass(t, scale[(i / 4) % scale.length] / 2, beat * 1.8);
        if (i % 2 === 0) lead(t, scale[(i / 2) % scale.length], beat * 0.9);
      }
    }

    function start() {
      if (started) return;
      started = true;
      schedule();
    }

    function pause() {
      context.suspend();
    }

    function resume() {
      context.resume();
    }

    function stop() {
      master.gain.setTargetAtTime(0.0001, context.currentTime, 0.02);
      nodes.forEach((node) => {
        try { node.stop(context.currentTime + 0.05); } catch (_error) {}
      });
      window.setTimeout(() => context.close(), 120);
    }

    function drum(time, type) {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(type === "kick" ? 120 : 190, time);
      osc.frequency.exponentialRampToValueAtTime(type === "kick" ? 48 : 90, time + 0.12);
      gain.gain.setValueAtTime(type === "kick" ? 0.8 : 0.28, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.16);
      osc.connect(gain).connect(master);
      osc.start(time);
      osc.stop(time + 0.18);
      nodes.push(osc);
    }

    function hat(time) {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = "square";
      osc.frequency.value = 7600;
      gain.gain.setValueAtTime(0.08, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
      osc.connect(gain).connect(master);
      osc.start(time);
      osc.stop(time + 0.05);
      nodes.push(osc);
    }

    function bass(time, frequency, duration) {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = "sawtooth";
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.18, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
      osc.connect(gain).connect(master);
      osc.start(time);
      osc.stop(time + duration);
      nodes.push(osc);
    }

    function lead(time, frequency, duration) {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = "triangle";
      osc.frequency.value = frequency * 2;
      gain.gain.setValueAtTime(0.11, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
      osc.connect(gain).connect(master);
      osc.start(time);
      osc.stop(time + duration);
      nodes.push(osc);
    }

    return { context, start, pause, resume, stop };
  }

  function stopAudio() {
    if (audio) audio.stop();
    audio = null;
  }

  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
    return `${mins}:${secs}`;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  init();
})();
