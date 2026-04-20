import * as Phaser from "phaser";

export default class HomeScene extends Phaser.Scene {
  constructor() {
    super("HomeScene");
  }

  create() {
    this.scale.off("resize", this._onResize, this);
    this._onResize = () => {
      this.children.removeAll(true);
      this._currentScreen === "mode"
        ? this._buildModeSelect()
        : this._buildHome();
    };
    this.scale.on("resize", this._onResize, this);

    this._currentScreen = "home";
    this._buildHome();
  }

  shutdown() {
    this.scale.off("resize", this._onResize, this);
  }

  // ═══════════════════════════════════════════════════════
  // HOME SCREEN
  // ═══════════════════════════════════════════════════════
  _buildHome() {
    this._currentScreen = "home";
    this.children.removeAll(true);

    const W = this.scale.width;
    const H = this.scale.height;

    // Background
    const bg = this.add.graphics();
    bg.fillStyle(0x020a12, 1);
    bg.fillRect(0, 0, W, H);

    // Decorative grid lines
    const grid = this.add.graphics();
    grid.lineStyle(1, 0x0a2a1a, 0.6);
    for (let x = 0; x < W; x += 40) grid.lineBetween(x, 0, x, H);
    for (let y = 0; y < H; y += 40) grid.lineBetween(0, y, W, y);

    // Glow circle behind title
    const glow = this.add.graphics();
    glow.fillStyle(0x00ff44, 0.04);
    glow.fillCircle(W / 2, H * 0.22, 200);

    // Title
    this.add.text(W / 2, H * 0.18, "MACHINES", {
      fontSize: "52px",
      fill: "#00ff44",
      fontStyle: "bold",
      stroke: "#003311",
      strokeThickness: 6,
    }).setOrigin(0.5);

    this.add.text(W / 2, H * 0.28, "RUN AMOK", {
      fontSize: "28px",
      fill: "#88ffaa",
      fontStyle: "bold",
      stroke: "#002208",
      strokeThickness: 4,
      letterSpacing: 10,
    }).setOrigin(0.5);

    // Divider
    const div = this.add.graphics();
    div.lineStyle(1, 0x00ff44, 0.3);
    div.lineBetween(W / 2 - 120, H * 0.345, W / 2 + 120, H * 0.345);

    // Subtitle
    this.add.text(W / 2, H * 0.37, "SURVIVE. UPGRADE. DOMINATE.", {
      fontSize: "11px",
      fill: "#336644",
      fontStyle: "bold",
      letterSpacing: 3,
    }).setOrigin(0.5);

    // START button visuals
    const btnW = 260;
    const btnH = 52;
    const btnX = W / 2 - btnW / 2;
    const btnY = H * 0.52 - btnH / 2;

    const startBg = this.add.graphics();
    const drawStartBtn = (hover) => {
      startBg.clear();
      startBg.fillStyle(hover ? 0x00ff44 : 0x031a09, 1);
      startBg.lineStyle(1, 0x00ff44, 1);
      startBg.fillRoundedRect(btnX, btnY, btnW, btnH, 6);
      startBg.strokeRoundedRect(btnX, btnY, btnW, btnH, 6);
    };
    drawStartBtn(false);

    const startLabel = this.add.text(W / 2, H * 0.52, "▶   START GAME", {
      fontSize: "22px",
      fill: "#00ff44",
      fontStyle: "bold",
    }).setOrigin(0.5);

    // Zone added LAST so it's on top and gets all pointer events
    const startZone = this.add
      .zone(W / 2, H * 0.52, btnW, btnH)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    startZone.on("pointerover", () => {
      drawStartBtn(true);
      startLabel.setStyle({ fill: "#000000" });
    });
    startZone.on("pointerout", () => {
      drawStartBtn(false);
      startLabel.setStyle({ fill: "#00ff44" });
    });
    startZone.on("pointerdown", () => this._buildModeSelect());

    // Footer
    this.add
      .text(
        W / 2,
        H * 0.92,
        "WASD · Move    SHIFT · Sprint    ESC · Pause    K · Stats",
        { fontSize: "11px", fill: "#224422", letterSpacing: 1 }
      )
      .setOrigin(0.5);

    this.add
      .text(W / 2, H * 0.96, "v0.1 alpha", {
        fontSize: "10px",
        fill: "#1a3322",
      })
      .setOrigin(0.5);
  }

  // ═══════════════════════════════════════════════════════
  // MODE SELECT SCREEN
  // ═══════════════════════════════════════════════════════
  _buildModeSelect() {
    this._currentScreen = "mode";
    this.children.removeAll(true);

    const W = this.scale.width;
    const H = this.scale.height;

    // Background
    const bg = this.add.graphics();
    bg.fillStyle(0x020a12, 1);
    bg.fillRect(0, 0, W, H);

    // Grid
    const grid = this.add.graphics();
    grid.lineStyle(1, 0x0a2a1a, 0.5);
    for (let x = 0; x < W; x += 40) grid.lineBetween(x, 0, x, H);
    for (let y = 0; y < H; y += 40) grid.lineBetween(0, y, W, y);

    // Panel
    const panelW = Math.min(520, W - 40);
    const panelH = Math.min(560, H - 40);
    const px = (W - panelW) / 2;
    const py = (H - panelH) / 2;

    const panel = this.add.graphics();
    panel.fillStyle(0x050f1c, 0.97);
    panel.fillRoundedRect(px, py, panelW, panelH, 14);
    panel.lineStyle(1, 0x1a4433, 1);
    panel.strokeRoundedRect(px, py, panelW, panelH, 14);

    // Panel header accent bar
    const accent = this.add.graphics();
    accent.fillStyle(0x00ff44, 1);
    accent.fillRect(px + 20, py, 3, 44);

    // Panel title
    this.add.text(px + 34, py + 14, "SELECT MODE", {
      fontSize: "20px",
      fill: "#ffffff",
      fontStyle: "bold",
    });
    this.add.text(px + 34, py + 36, "Choose your challenge", {
      fontSize: "11px",
      fill: "#336644",
    });

    // Header divider
    const hdiv = this.add.graphics();
    hdiv.lineStyle(1, 0x1a4433, 0.8);
    hdiv.lineBetween(px + 20, py + 54, px + panelW - 20, py + 54);

    // Mode definitions
    const modes = [
      {
        key: "classic",
        icon: "🎮",
        label: "Classic",
        tag: "AVAILABLE",
        desc: "Survive endless waves. Collect XP, level up, defeat the boss.",
        color: 0x00ff44,
        colorHex: "#00ff44",
        locked: false,
      },
      {
        key: "challenge",
        icon: "⚡",
        label: "Challenge",
        tag: "COMING SOON",
        desc: "Fixed loadout. No upgrades. How long can you last?",
        color: 0xffcc00,
        colorHex: "#ffcc00",
        locked: true,
      },
      {
        key: "bossrush",
        icon: "💀",
        label: "Boss Rush",
        tag: "COMING SOON",
        desc: "Back-to-back bosses with brief rest windows between fights.",
        color: 0xff4444,
        colorHex: "#ff4444",
        locked: true,
      },
      {
        key: "online",
        icon: "🌐",
        label: "Online Multiplayer",
        tag: "COMING SOON",
        desc: "Co-op survival with up to 4 players.",
        color: 0x44aaff,
        colorHex: "#44aaff",
        locked: true,
      },
    ];

    const cardW = panelW - 40;
    const cardH = 80;
    const cardX = px + 20;
    const GAP = 8;

    // We collect all zone-creation calls and run them AFTER all visuals
    const zoneCallbacks = [];

    modes.forEach((mode, index) => {
      const cardY = py + 66 + index * (cardH + GAP);

      // Card background graphics
      const card = this.add.graphics();

      const drawCard = (hover) => {
        card.clear();
        if (mode.locked) {
          card.fillStyle(0x080e18, 0.9);
          card.lineStyle(1, 0x151f2e, 1);
        } else if (hover) {
          card.fillStyle(0x0a1f10, 1);
          card.lineStyle(2, mode.color, 1);
        } else {
          card.fillStyle(0x07111e, 0.95);
          card.lineStyle(1, 0x1a3344, 1);
        }
        card.fillRoundedRect(cardX, cardY, cardW, cardH, 8);
        card.strokeRoundedRect(cardX, cardY, cardW, cardH, 8);

        if (!mode.locked && hover) {
          card.fillStyle(mode.color, 1);
          card.fillRect(cardX, cardY + 10, 3, cardH - 20);
        }
      };

      drawCard(false);

      // Icon bg circle
      const iconBg = this.add.graphics();
      iconBg.fillStyle(mode.locked ? 0x0d1220 : 0x0a1f10, 1);
      iconBg.fillCircle(cardX + 36, cardY + cardH / 2, 22);

      // Icon
      this.add
        .text(cardX + 36, cardY + cardH / 2, mode.icon, { fontSize: "22px" })
        .setOrigin(0.5);

      // Label
      this.add.text(cardX + 70, cardY + 16, mode.label, {
        fontSize: "15px",
        fill: mode.locked ? "#3a4f5a" : mode.colorHex,
        fontStyle: "bold",
      });

      // Description
      this.add.text(cardX + 70, cardY + 36, mode.desc, {
        fontSize: "11px",
        fill: mode.locked ? "#253545" : "#7a9aaa",
        wordWrap: { width: cardW - 120 },
      });

      // Tag badge
      const tagBg = this.add.graphics();
      tagBg.fillStyle(mode.locked ? 0x0d1520 : 0x001a08, 1);
      tagBg.fillRoundedRect(cardX + cardW - 110, cardY + 10, 100, 18, 4);
      this.add
        .text(cardX + cardW - 60, cardY + 19, mode.tag, {
          fontSize: "9px",
          fill: mode.locked ? "#445566" : mode.colorHex,
          fontStyle: "bold",
        })
        .setOrigin(0.5);

      // Queue zone creation for AFTER all visuals are added
      zoneCallbacks.push(() => {
        if (mode.locked) return;

        // Zone sits on top of everything — added last
        const zone = this.add
          .zone(cardX + cardW / 2, cardY + cardH / 2, cardW, cardH)
          .setOrigin(0.5)
          .setInteractive({ useHandCursor: true });

        zone.on("pointerover", () => drawCard(true));
        zone.on("pointerout", () => drawCard(false));
        zone.on("pointerdown", () => this._startMode(mode.key));
      });
    });

    // Back button visuals
    const backBtnY = py + panelH - 28;
    const backLabel = this.add
      .text(W / 2, backBtnY, "← BACK TO MENU", {
        fontSize: "13px",
        fill: "#336655",
        fontStyle: "bold",
        letterSpacing: 1,
      })
      .setOrigin(0.5);

    // Queue back button zone
    zoneCallbacks.push(() => {
      const backZone = this.add
        .zone(W / 2, backBtnY, 200, 30)
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });

      backZone.on("pointerover", () =>
        backLabel.setStyle({ fill: "#00ff88" })
      );
      backZone.on("pointerout", () =>
        backLabel.setStyle({ fill: "#336655" })
      );
      backZone.on("pointerdown", () => this._buildHome());
    });

    // ✅ Now add ALL zones last — they sit on top of all visuals
    zoneCallbacks.forEach((fn) => fn());
  }

  // ═══════════════════════════════════════════════════════
  // START MODE
  // ═══════════════════════════════════════════════════════
  _startMode(key) {
    if (key === "classic") {
      this.scene.start("GameScene");
    } else {
      console.log(`Mode "${key}" not yet implemented.`);
    }
  }
}