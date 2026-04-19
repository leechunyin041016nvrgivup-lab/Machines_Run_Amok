import * as Phaser from "phaser";

export default class GameScene extends Phaser.Scene {
  constructor() {
    super("GameScene");
  }

  create() {
    // ─── SCREEN SIZE (live reference) ─────────────────────
    const W = this.scale.width;
    const H = this.scale.height;

    this.worldWidth  = Math.max(2000, W  * 2.5);
    this.worldHeight = Math.max(2000, H * 2.5);

    this.physics.world.setBounds(0, 0, this.worldWidth, this.worldHeight);
    this.cameras.main.setBounds(0, 0, this.worldWidth, this.worldHeight);

    this.add.rectangle(this.worldWidth / 2, this.worldHeight / 2, this.worldWidth, this.worldHeight, 0x1a1a1a);

    // ─── PLAYER ───────────────────────────────────────────
    this.playerHP        = 100;
    this.playerMaxHP     = 100;
    this.playerHPRegen   = 0;
    this.playerLuck      = 0;
    this.playerMagnet    = 120;
    this.lastDamageTime  = 0;
    this.regenAccum      = 0;

    this.player = this.add.rectangle(this.worldWidth / 2, this.worldHeight / 2, 40, 40, 0x00ff00);
    this.physics.add.existing(this.player);
    this.player.body.setCollideWorldBounds(true);
    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);

    // ─── STATS ────────────────────────────────────────────
    this.moveSpeed    = 180;
    this.runSpeed     = 320;
    this.bulletDamage = 10;
    this.fireRate     = 500;

    // ─── ENERGY ───────────────────────────────────────────
    this.energy      = 100;
    this.energyMax   = 100;
    this.energyRegen = 5;    // per second
    this.energyDrain = 20;   // per second while sprinting
    this.isRunning   = false;

    // ─── SWORD ────────────────────────────────────────────
    this.hasSword   = false;
    this.swordLevel = 0;
    this.swords     = [];

    // ─── EMP ──────────────────────────────────────────────
    this.hasEMP    = false;
    this.empLevel  = 0;
    this.empDamage = 10;
    this.empRate   = 3000;
    this.empEvent  = null;

    // ─── GRENADE ──────────────────────────────────────────
    this.hasGrenade    = false;
    this.grenadeLevel  = 0;
    this.grenadeDamage = 40;
    this.grenadeRadius = 120;
    this.grenadeRate   = 4000;
    this.grenadeEvent  = null;
    this.totalGrenadeDmg = 0;

    // ─── BOSS ─────────────────────────────────────────────
    this.boss             = null;
    this.bossMaxHP        = 1000;
    this.bossHP           = 0;
    this.bossSpawned      = false;
    this.bossDefeated     = false;
    // Boss spawns 1 minute after all 4 enemy types are unlocked (≥180s → boss at ≥240s)
    this.bossSpawnTime    = 240; // seconds

    // ─── XP / LEVEL ───────────────────────────────────────
    this.xp       = 0;
    this.level    = 1;
    this.xpToNext = 25;

    // ─── TRACKING ─────────────────────────────────────────
    this.gameTime     = 0;
    this.killCount    = 0;
    this.totalDmgDone = 0;
    this.isPaused     = false;

    // ─── INPUT ────────────────────────────────────────────
    this.keys = this.input.keyboard.addKeys("W,A,S,D,ESC,SHIFT");

    // ─── GROUPS ───────────────────────────────────────────
    this.enemies       = this.physics.add.group();
    this.loots         = this.physics.add.group();
    this.bullets       = this.physics.add.group();
    this.sniperBullets = this.physics.add.group();
    this.sniperWarnings = [];

    // ─── TIMERS ───────────────────────────────────────────
    this.spawnEvent = this.time.addEvent({ delay: 800,          loop: true, callback: () => this.spawnEnemy() });
    this.shootEvent = this.time.addEvent({ delay: this.fireRate, loop: true, callback: () => this.shootNearestEnemy() });

    // ─── COLLISIONS ───────────────────────────────────────
    this.physics.add.overlap(this.player, this.enemies, (p, e) => {
      if (e.type === "exploder") return;
      if (this.time.now - this.lastDamageTime > 500) {
        this.playerHP -= 10;
        this.lastDamageTime = this.time.now;
        this.cameras.main.shake(100, 0.01);
        if (this.playerHP <= 0) this.showDeathScreen();
      }
    });

    this.physics.add.overlap(this.bullets, this.enemies, (b, e) => {
      const dmg = b.damage || this.bulletDamage;
      e.hp -= dmg;
      this.totalDmgDone += dmg;
      b.destroy();
      this.hitEffect(e);
      if (e.hp <= 0) this.killEnemy(e);
    });

    this.physics.add.overlap(this.sniperBullets, this.player, (objA, objB) => {
      const bullet = this.sniperBullets.contains(objA) ? objA : objB;
      if (!bullet || !bullet.active) return;
      bullet.destroy();
      if (this.time.now - this.lastDamageTime > 100) {
        this.playerHP -= 40;
        this.lastDamageTime = this.time.now;
        this.cameras.main.shake(200, 0.02);
        if (this.playerHP <= 0) this.showDeathScreen();
      }
    });

    // ─── UI ───────────────────────────────────────────────
    this.buildUI();

    // ─── RESIZE HANDLER ───────────────────────────────────
    this.scale.on("resize", this.onResize, this);
  }

  // ── Rebuild HUD on resize ──
  onResize() {
    if (this.uiContainer) this.uiContainer.destroy();
    if (this.bossUI)      { this.bossUI.forEach(o => o.destroy()); this.bossUI = null; }
    this.buildUI();
    if (this.boss && this.boss.active) this.buildBossUI();
  }

  buildUI() {
    if (this.uiContainer) this.uiContainer.destroy();
    this.uiContainer = this.add.container(0, 0).setScrollFactor(0).setDepth(5);
    this.ui = {};

    const SW = this.scale.width;
    const SH = this.scale.height;

    // ── Rounded rect helper ────────────────────────────────
    const rr = (gfx, x, y, w, h, r, col, al = 1) => {
      gfx.fillStyle(col, al);
      gfx.fillRoundedRect(x, y, w, h, r);
    };

    // ═══════════════════════════════════════════════════════
    // TOP-LEFT PANEL
    // ═══════════════════════════════════════════════════════
    const PAD  = 10;
    const AVS  = 52;
    const BARW = 148;
    const BARH = 15;
    const BARX = PAD + AVS + 18;  // +18 for icon labels
    const BARY1 = PAD + 2;
    const BARY2 = BARY1 + BARH + 5;
    const BARY3 = BARY2 + BARH + 5;
    const SLOT_S   = 40;
    const SLOT_GAP = 4;
    const SLOT_Y   = PAD + AVS + 8;
    const PANEL_W  = BARX + BARW + PAD;
    const PANEL_H  = SLOT_Y + SLOT_S + PAD;

    // Panel bg
    const panelBg = this.add.graphics().setScrollFactor(0).setDepth(5);
    rr(panelBg, 0, 0, PANEL_W, PANEL_H, 8, 0x000000, 0.65);

    // Avatar
    const avGfx = this.add.graphics().setScrollFactor(0).setDepth(6);
    rr(avGfx, PAD, PAD, AVS, AVS, 6, 0x003311, 0.95);
    rr(avGfx, PAD + 4, PAD + 4, AVS - 8, AVS - 8, 4, 0x00ff00, 0.9);
    const avLabel = this.add.text(PAD + AVS / 2, PAD + AVS / 2, "P1", {
      fontSize: "13px", fill: "#002200", fontStyle: "bold"
    }).setOrigin(0.5).setScrollFactor(0).setDepth(7);

    // Bar backgrounds
    const barBg = this.add.graphics().setScrollFactor(0).setDepth(6);
    rr(barBg, BARX, BARY1, BARW, BARH, 3, 0x440000, 0.9);
    rr(barBg, BARX, BARY2, BARW, BARH, 3, 0x001133, 0.9);
    rr(barBg, BARX, BARY3, BARW, BARH, 3, 0x001133, 0.9);

    // Bar fill graphics (redrawn each frame)
    this.uiBarFills = this.add.graphics().setScrollFactor(0).setDepth(7);

    // Bar icon labels
    const iconStyle = { fontSize: "10px", fontStyle: "bold" };
    this.add.text(PAD + AVS + 3, BARY1 + 1, "HP", { ...iconStyle, fill: "#ff5555" }).setScrollFactor(0).setDepth(7);
    this.add.text(PAD + AVS + 3, BARY2 + 1, "XP", { ...iconStyle, fill: "#4488ff" }).setScrollFactor(0).setDepth(7);
    this.add.text(PAD + AVS + 3, BARY3 + 1, "EN", { ...iconStyle, fill: "#00ccff" }).setScrollFactor(0).setDepth(7);

    // Bar value texts (centered on bar)
    const barTxtStyle = { fontSize: "10px", fill: "#ffffff", fontStyle: "bold" };
    this.ui.hpText     = this.add.text(BARX + BARW / 2, BARY1 + BARH / 2, "", barTxtStyle).setOrigin(0.5).setScrollFactor(0).setDepth(8);
    this.ui.xpText     = this.add.text(BARX + BARW / 2, BARY2 + BARH / 2, "", barTxtStyle).setOrigin(0.5).setScrollFactor(0).setDepth(8);
    this.ui.energyText = this.add.text(BARX + BARW / 2, BARY3 + BARH / 2, "", barTxtStyle).setOrigin(0.5).setScrollFactor(0).setDepth(8);

    // Weapon slots
    const slotGfx = this.add.graphics().setScrollFactor(0).setDepth(6);
    this.ui.weaponSlots  = [];
    this.ui.weaponLabels = [];
    for (let i = 0; i < 4; i++) {
      const sx = PAD + i * (SLOT_S + SLOT_GAP);
      rr(slotGfx, sx, SLOT_Y, SLOT_S, SLOT_S, 5, 0x0a0a1a, 0.9);
      slotGfx.lineStyle(1, 0x334466, 0.9);
      slotGfx.strokeRoundedRect(sx, SLOT_Y, SLOT_S, SLOT_S, 5);

      const icon = this.add.text(sx + SLOT_S / 2, SLOT_Y + 14, "", { fontSize: "15px" })
        .setOrigin(0.5).setScrollFactor(0).setDepth(7);
      const lv = this.add.text(sx + SLOT_S - 3, SLOT_Y + SLOT_S - 3, "", {
        fontSize: "10px", fill: "#ffdd55", fontStyle: "bold"
      }).setOrigin(1, 1).setScrollFactor(0).setDepth(7);

      this.ui.weaponSlots.push(icon);
      this.ui.weaponLabels.push(lv);
    }

    // ═══════════════════════════════════════════════════════
    // TOP-CENTER — Timer
    // ═══════════════════════════════════════════════════════
    const timerBg = this.add.graphics().setScrollFactor(0).setDepth(5);
    rr(timerBg, SW / 2 - 50, 8, 100, 28, 6, 0x000000, 0.65);
    this.ui.time = this.add.text(SW / 2, 22, "0:00", {
      fontSize: "15px", fill: "#ffffff", fontStyle: "bold"
    }).setOrigin(0.5).setScrollFactor(0).setDepth(6);

    // ═══════════════════════════════════════════════════════
    // TOP-RIGHT — Settings button
    // ═══════════════════════════════════════════════════════
    const settingsBg = this.add.graphics().setScrollFactor(0).setDepth(5);
    const SBX = SW - 44, SBY = 8, SBW = 36, SBH = 28;
    rr(settingsBg, SBX, SBY, SBW, SBH, 6, 0x000000, 0.65);
    settingsBg.setInteractive(new Phaser.Geom.Rectangle(SBX, SBY, SBW, SBH), Phaser.Geom.Rectangle.Contains)
      .on("pointerdown", () => this.openPauseMenu())
      .on("pointerover", () => { settingsBg.clear(); rr(settingsBg, SBX, SBY, SBW, SBH, 6, 0x223355, 0.9); })
      .on("pointerout",  () => { settingsBg.clear(); rr(settingsBg, SBX, SBY, SBW, SBH, 6, 0x000000, 0.65); });
    this.add.text(SBX + SBW / 2, SBY + SBH / 2, "=", {
      fontSize: "16px", fill: "#cccccc", fontStyle: "bold"
    }).setOrigin(0.5).setScrollFactor(0).setDepth(6);

    // ═══════════════════════════════════════════════════════
    // BOTTOM-RIGHT — Debug buttons
    // ═══════════════════════════════════════════════════════
    const dbStyle = { fontSize: "11px", fill: "#aaaaaa", backgroundColor: "#111111", padding: { x: 5, y: 3 } };
    this.add.text(SW - 8, SH - 8, "[+1 MIN]", dbStyle)
      .setOrigin(1, 1).setScrollFactor(0).setDepth(6)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => { this.gameTime += 60000; });
    this.add.text(SW - 80, SH - 8, "[LVL UP]", dbStyle)
      .setOrigin(1, 1).setScrollFactor(0).setDepth(6)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.levelUp());
  }

  // ─── BOSS DEBUG UI (top-right) ────────────────────────
  buildBossUI() {
    if (this.bossUI) this.bossUI.forEach(o => o.destroy());
    const SW = this.scale.width;
    const SH = this.scale.height;

    const bgW = 200, bgH = 56;
    const bx = SW - bgW - 8;
    const by = SH - bgH - 34;   // above debug buttons

    const bg = this.add.graphics().setScrollFactor(0).setDepth(5);
    bg.fillStyle(0x220000, 0.82);
    bg.fillRoundedRect(bx, by, bgW, bgH, 6);

    const title = this.add.text(bx + 8, by + 6, "BOSS", {
      fontSize: "11px", fill: "#ff4444", fontStyle: "bold"
    }).setScrollFactor(0).setDepth(6);

    this.bossHPText = this.add.text(bx + 8, by + 20, "", {
      fontSize: "12px", fill: "#ff8888"
    }).setScrollFactor(0).setDepth(6);

    this.bossPosText = this.add.text(bx + 8, by + 36, "", {
      fontSize: "10px", fill: "#cc6666"
    }).setScrollFactor(0).setDepth(6);

    this.bossUI = [bg, title, this.bossHPText, this.bossPosText];
  }

  destroyBossUI() {
    if (this.bossUI) { this.bossUI.forEach(o => o.destroy()); this.bossUI = null; }
    this.bossHPText  = null;
    this.bossPosText = null;
  }

  // ═══════════════════════════════════════════════════════
  // UPDATE
  // ═══════════════════════════════════════════════════════
  update(time, delta) {
    if (this.isPaused) return;

    this.gameTime += delta;

    this.handleMovement(delta);
    this.handleEnemies();
    this.handleLoot();
    this.handleRegen(delta);
    this.updateSwords();
    this.updateUI();
    this.checkBossSpawn();

    if (Phaser.Input.Keyboard.JustDown(this.keys.ESC)) this.openPauseMenu();
  }

  // ═══════════════════════════════════════════════════════
  // BOSS SPAWN & AI
  // ═══════════════════════════════════════════════════════
  checkBossSpawn() {
    const sec = Math.floor(this.gameTime / 1000);
    if (!this.bossSpawned && !this.bossDefeated && sec >= this.bossSpawnTime) {
      this.bossSpawned = true;
      this.spawnBoss();
    }
  }

  spawnBoss() {
    // ── Announce ──────────────────────────────────────────
    const SW = this.scale.width, SH = this.scale.height;
    const announce = this.add.text(SW / 2, SH * 0.3, "⚠️  BOSS INCOMING ⚠️", {
      fontSize: "28px", fill: "#ff0000", stroke: "#000", strokeThickness: 5
    }).setOrigin(0.5).setScrollFactor(0).setDepth(15);
    this.time.delayedCall(2500, () => announce.destroy());

    // ── Spawn off-screen ──────────────────────────────────
    const pos = this.getSpawnPosition();

    const b = this.add.rectangle(pos.x, pos.y, 55, 55, 0xff2200);
    this.physics.add.existing(b);
    b.body.setCollideWorldBounds(true);

    b.type    = "boss";
    b.hp      = this.bossMaxHP;
    b.maxHp   = this.bossMaxHP;
    b.isBoss  = true;

    // ── Phase-1 stats ─────────────────────────────────────
    b.phase       = 1;          // 1 = chase, 2 = aim-then-ram
    b.speed       = 220;        // phase-1 chase speed

    // ── Phase-2 state machine ─────────────────────────────
    // States:  "chase" | "windup" | "ram" | "recover"
    b.p2State     = "chase";
    b.p2Entered   = false;      // have we shown the enrage warning yet?
    b.ramTargetX  = 0;          // locked aim target
    b.ramTargetY  = 0;
    b.ramAngle    = 0;
    b.windupEnd   = 0;          // timestamp when windup finishes
    b.recoverEnd  = 0;          // timestamp when recover finishes
    b.laserLine   = null;       // warning laser graphic

    // ── Floating label ────────────────────────────────────
    this.bossLabel = this.add.text(pos.x, pos.y - 38, "👹 BOSS", {
      fontSize: "13px", fill: "#ff4400", stroke: "#000", strokeThickness: 3
    }).setOrigin(0.5).setDepth(4);

    this.boss = b;
    this.enemies.add(b);

    // ── Contact damage (higher than normal enemies) ───────
    this.physics.add.overlap(this.player, b, () => {
      const dmg = b.p2State === "ram" ? 35 : 20;   // ram hits harder
      if (this.time.now - this.lastDamageTime > 400) {
        this.playerHP -= dmg;
        this.lastDamageTime = this.time.now;
        this.cameras.main.shake(150, 0.025);
        if (this.playerHP <= 0) this.showDeathScreen();
      }
    });

    this.buildBossUI();
  }

  handleBossAI(e) {
    const now = this.time.now;

    // ── Phase transition: HP drops to ≤ 50% ──────────────
    if (e.phase === 1 && e.hp <= e.maxHp * 0.5) {
      e.phase   = 2;
      e.p2State = "windup";
      e.body.setVelocity(0, 0);
      this._bossStartWindup(e);

      if (!e.p2Entered) {
        e.p2Entered = true;
        const SW = this.scale.width, SH = this.scale.height;
        const rage = this.add.text(SW / 2, SH * 0.35, "💢 BOSS ENRAGED!", {
          fontSize: "24px", fill: "#ff6600", stroke: "#000", strokeThickness: 4
        }).setOrigin(0.5).setScrollFactor(0).setDepth(15);
        this.time.delayedCall(2000, () => rage.destroy());
      }
    }

    // ─────────────────────────────────────────────────────
    // PHASE 1 — fast straight chase
    // ─────────────────────────────────────────────────────
    if (e.phase === 1) {
      this.physics.moveToObject(e, this.player, e.speed);
    }

    // ─────────────────────────────────────────────────────
    // PHASE 2 — stop → aim → ram loop
    // ─────────────────────────────────────────────────────
    else {
      switch (e.p2State) {

        // ── WINDUP: fully stopped, laser aims at player ──
        case "windup":
          e.body.setVelocity(0, 0);

          // Draw/update warning laser each frame during windup
          if (e.laserLine) e.laserLine.destroy();
          e.laserLine = this.add.graphics();
          // Flicker: alternate red ↔ white based on time
          const flickerColor = Math.floor(now / 120) % 2 === 0 ? 0xff0000 : 0xffffff;
          e.laserLine.lineStyle(3, flickerColor, 0.8);
          e.laserLine.beginPath();
          e.laserLine.moveTo(e.x, e.y);
          // Extend laser far beyond player so it reads as a ray
          const laserAngle = Phaser.Math.Angle.Between(e.x, e.y, e.ramTargetX, e.ramTargetY);
          e.laserLine.lineTo(
            e.x + Math.cos(laserAngle) * 1200,
            e.y + Math.sin(laserAngle) * 1200
          );
          e.laserLine.strokePath();

          // Keep re-locking target during first half of windup (tracking window),
          // then freeze aim for the second half so player has a chance to dodge
          if (now < e.windupEnd - 600) {
            e.ramTargetX = this.player.x;
            e.ramTargetY = this.player.y;
            e.ramAngle   = Phaser.Math.Angle.Between(e.x, e.y, e.ramTargetX, e.ramTargetY);
          }

          // Windup over → RAM
          if (now >= e.windupEnd) {
            if (e.laserLine) { e.laserLine.destroy(); e.laserLine = null; }
            e.p2State = "ram";
            this.cameras.main.shake(80, 0.012);
          }
          break;

        // ── RAM: dash through player at extreme speed ──
        case "ram":
          e.body.setVelocity(
            Math.cos(e.ramAngle) * 600,
            Math.sin(e.ramAngle) * 600
          );

          if (!e.ramStartTime) {
            e.ramStartTime = now;
            e.ramStartX    = e.x;
            e.ramStartY    = e.y;
          }

          // Stop after travelling ~600px past start OR 1.2s — enough to blow through the player
          const travelDist = Phaser.Math.Distance.Between(e.x, e.y, e.ramStartX, e.ramStartY);
          if (travelDist > 600 || now - e.ramStartTime > 1200) {
            e.ramStartTime = 0;
            e.ramStartX    = 0;
            e.ramStartY    = 0;
            e.p2State      = "recover";
            e.recoverEnd   = now + 700;
            e.body.setVelocity(0, 0);
            this.cameras.main.shake(120, 0.018);
          }
          break;

        // ── RECOVER: short pause, then wind up again ──────
        case "recover":
          e.body.setVelocity(0, 0);
          if (now >= e.recoverEnd) {
            e.p2State = "windup";
            this._bossStartWindup(e);
          }
          break;
      }
    }

    // ── Floating label ────────────────────────────────────
    if (this.bossLabel && this.bossLabel.active) {
      this.bossLabel.setPosition(e.x, e.y - 42);
      // Colour-code label by phase
      this.bossLabel.setStyle({ fill: e.phase === 2 ? "#ff6600" : "#ff4400" });
    }

    // ── Debug UI ──────────────────────────────────────────
    if (this.bossHPText) {
      const pct = Math.max(0, Math.floor((e.hp / e.maxHp) * 100));
      this.bossHPText.setText(`HP: ${Math.max(0, e.hp)} / ${e.maxHp}  (${pct}%)`);
    }
    if (this.bossPosText) {
      const stateLabel = e.phase === 1 ? "chase" : `P2:${e.p2State}`;
      this.bossPosText.setText(`X:${Math.floor(e.x)}  Y:${Math.floor(e.y)}  [${stateLabel}]`);
    }
  }

  // Helper: begin a windup cycle — record locked target & end timestamp
  _bossStartWindup(e) {
    e.ramTargetX = this.player.x;
    e.ramTargetY = this.player.y;
    e.ramAngle   = Phaser.Math.Angle.Between(e.x, e.y, e.ramTargetX, e.ramTargetY);
    e.windupEnd  = this.time.now + 1500;  // 1.5s aim window
  }

  // ═══════════════════════════════════════════════════════
  // HP REGEN
  // ═══════════════════════════════════════════════════════
  handleRegen(delta) {
    // HP regen
    if (this.playerHPRegen > 0) {
      this.regenAccum += delta;
      if (this.regenAccum >= 1000) {
        this.regenAccum -= 1000;
        this.playerHP = Math.min(this.playerMaxHP, this.playerHP + this.playerHPRegen);
      }
    }
    // Energy regen — only when not sprinting
    if (!this.isRunning) {
      this.energy = Math.min(this.energyMax, this.energy + this.energyRegen * (delta / 1000));
    }
  }

  // ═══════════════════════════════════════════════════════
  // MOVEMENT
  // ═══════════════════════════════════════════════════════
  handleMovement(delta) {
    if (!this.player.body) return;

    // Determine if sprinting: SHIFT held + moving + has energy
    const moving = this.keys.A.isDown || this.keys.D.isDown || this.keys.W.isDown || this.keys.S.isDown;
    const wantRun = this.keys.SHIFT.isDown && moving && this.energy > 0;

    if (wantRun) {
      this.isRunning = true;
      this.energy = Math.max(0, this.energy - this.energyDrain * (delta / 1000));
    } else {
      this.isRunning = false;
    }

    const spd = this.isRunning ? this.runSpeed : this.moveSpeed;

    let vx = 0, vy = 0;
    if (this.keys.A.isDown) vx = -spd;
    if (this.keys.D.isDown) vx =  spd;
    if (this.keys.W.isDown) vy = -spd;
    if (this.keys.S.isDown) vy =  spd;
    this.player.body.setVelocity(vx, vy);
    if (vx || vy) this.player.body.velocity.normalize().scale(spd);

    // Tint player green→yellow→red based on energy level for quick visual feedback
    if (this.isRunning) {
      this.player.fillColor = 0x00ddff;
    } else if (this.energy < 30) {
      this.player.fillColor = 0xffaa00;
    } else {
      this.player.fillColor = 0x00ff00;
    }
  }

  // ═══════════════════════════════════════════════════════
  // ENEMY SPAWN
  // ═══════════════════════════════════════════════════════
  spawnEnemy() {
    const sec = Math.floor(this.gameTime / 1000);
    const pos = this.getSpawnPosition();
    let type = "basic";

    if      (sec >= 180) { type = ["basic","spider","exploder","sniper"][Phaser.Math.Between(0, 3)]; }
    else if (sec >= 120) { type = ["basic","spider","exploder"][Phaser.Math.Between(0, 2)]; }
    else if (sec >= 60)  { type = Phaser.Math.Between(0, 1) ? "spider" : "basic"; }

    if      (type === "basic")    this.spawnBasicEnemy(pos.x, pos.y);
    else if (type === "spider")   this.spawnSpider(pos.x, pos.y);
    else if (type === "exploder") this.spawnExploder(pos.x, pos.y);
    else if (type === "sniper")   this.spawnSniper(pos.x, pos.y);
  }

  getSpawnPosition() {
    const cam  = this.cameras.main;
    const m    = 100;
    const side = Phaser.Math.Between(0, 3);
    if (side === 0) return { x: Phaser.Math.Between(cam.worldView.x, cam.worldView.right), y: cam.worldView.y - m };
    if (side === 1) return { x: Phaser.Math.Between(cam.worldView.x, cam.worldView.right), y: cam.worldView.bottom + m };
    if (side === 2) return { x: cam.worldView.x - m, y: Phaser.Math.Between(cam.worldView.y, cam.worldView.bottom) };
    return               { x: cam.worldView.right + m, y: Phaser.Math.Between(cam.worldView.y, cam.worldView.bottom) };
  }

  spawnBasicEnemy(x, y) {
    const e = this.add.rectangle(x, y, 30, 30, 0xff0000);
    this.physics.add.existing(e);
    e.type = "basic"; e.speed = 50; e.hp = 30;
    this.enemies.add(e);
  }

  spawnSpider(x, y) {
    const e = this.add.rectangle(x, y, 25, 25, 0x00ffff);
    this.physics.add.existing(e);
    e.type = "spider"; e.speed = 120; e.hp = 20;
    e.zigzagOffset = Phaser.Math.Between(0, 1000);
    this.enemies.add(e);
  }

  spawnExploder(x, y) {
    const e = this.add.rectangle(x, y, 28, 28, 0xff8800);
    this.physics.add.existing(e);
    e.type = "exploder"; e.speed = 140; e.hp = 25;
    this.enemies.add(e);
  }

  spawnSniper(x, y) {
    const e = this.add.rectangle(x, y, 22, 34, 0x9900ff);
    this.physics.add.existing(e);
    e.type         = "sniper";
    e.speed        = 60;
    e.hp           = 35;
    e.shotDamage   = 40;
    e.preferDist   = 350;
    e.lastShotTime = 0;
    e.shotCooldown = 3500;
    e.isCharging   = false;
    this.enemies.add(e);
  }

  handleSniperAI(e) {
    const dist = Phaser.Math.Distance.Between(e.x, e.y, this.player.x, this.player.y);

    if (e.isCharging) {
      e.body.setVelocity(0, 0);
      return;
    }

    if (dist < e.preferDist - 50) {
      const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, e.x, e.y);
      e.body.setVelocity(Math.cos(angle) * e.speed, Math.sin(angle) * e.speed);
    } else if (dist > e.preferDist + 100) {
      this.physics.moveToObject(e, this.player, e.speed * 0.6);
    } else {
      e.body.setVelocity(0, 0);
    }

    if (this.time.now - e.lastShotTime > e.shotCooldown) {
      e.isCharging = true;
      const targetX = this.player.x;
      const targetY = this.player.y;

      const laser = this.add.graphics();
      laser.lineStyle(2, 0xff0000, 0.7);
      laser.beginPath();
      laser.moveTo(e.x, e.y);
      laser.lineTo(targetX, targetY);
      laser.strokePath();
      this.sniperWarnings.push(laser);

      this.time.addEvent({
        delay: 150, repeat: 4,
        callback: () => { if (e.active) e.fillColor = e.fillColor === 0xffffff ? 0x9900ff : 0xffffff; }
      });

      this.time.delayedCall(1500, () => {
        laser.destroy();
        this.sniperWarnings = this.sniperWarnings.filter(l => l !== laser);
        if (!e.active || !this.player.active) return;

        e.isCharging   = false;
        e.lastShotTime = this.time.now;
        if (e.active) e.fillColor = 0x9900ff;

        const b = this.add.rectangle(e.x, e.y, 10, 10, 0xff00ff);
        this.physics.add.existing(b);
        b.damage = e.shotDamage;
        this.sniperBullets.add(b);
        const angle = Phaser.Math.Angle.Between(e.x, e.y, targetX, targetY);
        b.body.setVelocity(Math.cos(angle) * 600, Math.sin(angle) * 600);
        this.time.delayedCall(3000, () => { if (b.active) b.destroy(); });
      });
    }
  }

  // ═══════════════════════════════════════════════════════
  // HANDLE ENEMIES
  // ═══════════════════════════════════════════════════════
  handleEnemies() {
    this.enemies.getChildren().forEach(e => {
      if (e.stunnedUntil && this.time.now < e.stunnedUntil) {
        e.body.setVelocity(0, 0);
        return;
      }

      if (e.type === "boss")   { this.handleBossAI(e); return; }
      if (e.type === "sniper") { this.handleSniperAI(e); return; }

      if (e.type === "spider") {
        const angle  = Phaser.Math.Angle.Between(e.x, e.y, this.player.x, this.player.y);
        const offset = Math.sin(this.time.now / 200 + e.zigzagOffset) * 1.5;
        e.body.setVelocity(
          Math.cos(angle + offset) * e.speed,
          Math.sin(angle + offset) * e.speed
        );
      } else {
        this.physics.moveToObject(e, this.player, e.speed);
      }

      if (e.type === "exploder") {
        const d = Phaser.Math.Distance.Between(e.x, e.y, this.player.x, this.player.y);
        if (d < 40) { this.explode(e.x, e.y); e.destroy(); }
      }
    });
  }

  killEnemy(e) {
    if (!e.active) return;
    this.killCount++;
    const { x, y, type } = e;

    if (type === "boss") {
      if (e.laserLine) { e.laserLine.destroy(); e.laserLine = null; }
      e.destroy();
      if (this.bossLabel && this.bossLabel.active) this.bossLabel.destroy();
      this.bossDefeated = true;
      this.destroyBossUI();
      this.spawnBossLoot(x, y);
      this.showBossDefeated();
      return;
    }

    e.destroy();
    if (type === "exploder") this.explode(x, y);
    else this.spawnLootForType(x, y, type);
  }

  // ═══════════════════════════════════════════════════════
  // EXPLOSION
  // ═══════════════════════════════════════════════════════
  explode(x, y, radius = 100, dmg = 35) {
    const boom = this.add.circle(x, y, radius, 0xff8800, 0.35);
    this.time.delayedCall(220, () => boom.destroy());
    this.cameras.main.shake(150, 0.02);

    const dist = Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y);
    if (dist < radius) {
      this.playerHP -= dmg;
      if (this.playerHP <= 0) this.showDeathScreen();
    }

    this.enemies.getChildren().forEach(e => {
      const d = Phaser.Math.Distance.Between(x, y, e.x, e.y);
      if (d < radius && e.active) {
        e.hp -= 50;
        this.totalDmgDone += 50;
        if (e.hp <= 0) this.killEnemy(e);
      }
    });
  }

  // ═══════════════════════════════════════════════════════
  // SWORD
  // ═══════════════════════════════════════════════════════
  addSwordLevel() {
    if (!this.hasSword) {
      this.hasSword   = true;
      this.swordLevel = 1;
      this.createSwords(3);
    } else {
      this.swordLevel++;
      this.createSwords(3 + this.swordLevel - 1);
    }
  }

  createSwords(count) {
    this.swords.forEach(s => s.destroy());
    this.swords = [];
    for (let i = 0; i < count; i++) {
      const sword = this.add.rectangle(this.player.x, this.player.y, 10, 30, 0xffffff);
      this.physics.add.existing(sword);
      sword.angleOffset = (i / count) * Math.PI * 2;
      this.physics.add.overlap(sword, this.enemies, (s, e) => {
        const dmg = 5 + this.swordLevel * 2;
        e.hp -= dmg;
        this.totalDmgDone += dmg;
        this.hitEffect(e);
        if (e.hp <= 0) this.killEnemy(e);
      });
      this.swords.push(sword);
    }
  }

  updateSwords() {
    if (!this.hasSword) return;
    const radius = 80, speed = 0.005;
    this.swords.forEach(s => {
      const angle = this.time.now * speed + s.angleOffset;
      s.x = this.player.x + Math.cos(angle) * radius;
      s.y = this.player.y + Math.sin(angle) * radius;
    });
  }

  // ═══════════════════════════════════════════════════════
  // SHOOT
  // ═══════════════════════════════════════════════════════
  shootNearestEnemy() {
    if (this.isPaused) return;
    const enemies = this.enemies.getChildren();
    if (!enemies.length) return;

    let closest = enemies[0], min = Infinity;
    enemies.forEach(e => {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, e.x, e.y);
      if (d < min) { min = d; closest = e; }
    });

    const b = this.add.rectangle(this.player.x, this.player.y, 8, 8, 0x00ffff);
    this.physics.add.existing(b);
    b.damage = this.bulletDamage;
    this.bullets.add(b);
    this.physics.moveToObject(b, closest, 400);
    this.time.delayedCall(2000, () => { if (b.active) b.destroy(); });
  }

  // ═══════════════════════════════════════════════════════
  // EMP
  // ═══════════════════════════════════════════════════════
  addEMPLevel() {
    if (!this.hasEMP) {
      this.hasEMP   = true;
      this.empLevel = 1;
      this.startEMP();
    } else {
      this.empLevel++;
      this.empDamage += 5;
      this.empRate = Math.max(300, this.empRate - 100);
      this.startEMP();
    }
  }

  startEMP() {
    if (this.empEvent && !this.empEvent.hasDispatched) this.empEvent.remove(false);
    this.empEvent = this.time.addEvent({ delay: this.empRate, loop: true, callback: () => this.triggerEMP() });
  }

  triggerEMP() {
    if (this.isPaused) return;
    const radius = 120;
    const pulse  = this.add.circle(this.player.x, this.player.y, radius, 0x00ffff, 0.2);
    this.time.delayedCall(150, () => pulse.destroy());

    this.enemies.getChildren().forEach(e => {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, e.x, e.y);
      if (d < radius) {
        e.hp -= this.empDamage;
        this.totalDmgDone += this.empDamage;
        e.stunnedUntil = this.time.now + 1000;
        this.hitEffect(e);
        if (e.hp <= 0) this.killEnemy(e);
      }
    });
  }

  // ═══════════════════════════════════════════════════════
  // GRENADE
  // ═══════════════════════════════════════════════════════
  addGrenadeLevel() {
    if (!this.hasGrenade) {
      this.hasGrenade   = true;
      this.grenadeLevel = 1;
      this.startGrenade();
    } else {
      this.grenadeLevel++;
      this.grenadeDamage += 20;
      this.grenadeRadius += 20;
      this.grenadeRate = Math.max(1500, this.grenadeRate - 400);
      this.startGrenade();
    }
  }

  startGrenade() {
    if (this.grenadeEvent && !this.grenadeEvent.hasDispatched) this.grenadeEvent.remove(false);
    this.grenadeEvent = this.time.addEvent({ delay: this.grenadeRate, loop: true, callback: () => this.throwGrenade() });
  }

  throwGrenade() {
    if (this.isPaused) return;
    const enemies = this.enemies.getChildren();
    if (!enemies.length) return;

    let target = enemies[0], min = Infinity;
    enemies.forEach(e => {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, e.x, e.y);
      if (d < min) { min = d; target = e; }
    });

    const tx = target.x, ty = target.y;
    const g  = this.add.rectangle(this.player.x, this.player.y, 14, 14, 0x00ff66);
    this.physics.add.existing(g);

    const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, tx, ty);
    this.physics.moveTo(g, tx, ty, Math.min(dist / 0.6, 700));

    this.time.delayedCall(600, () => {
      if (!g.active) return;
      const bx = g.x, by = g.y;
      g.destroy();
      this.grenadeBlast(bx, by);
    });
  }

  grenadeBlast(x, y) {
    const r   = this.grenadeRadius;
    const dmg = this.grenadeDamage;

    const ring = this.add.circle(x, y, r,       0x00ff66, 0.25);
    const core = this.add.circle(x, y, r * 0.4, 0xffffff, 0.6);
    this.time.delayedCall(250, () => { ring.destroy(); core.destroy(); });
    this.cameras.main.shake(120, 0.015);

    const pd = Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y);
    if (pd < r) {
      this.playerHP -= 15;
      if (this.playerHP <= 0) this.showDeathScreen();
    }

    this.enemies.getChildren().forEach(e => {
      const d = Phaser.Math.Distance.Between(x, y, e.x, e.y);
      if (d < r && e.active) {
        e.hp -= dmg;
        this.totalDmgDone    += dmg;
        this.totalGrenadeDmg += dmg;
        this.hitEffect(e);
        if (e.hp <= 0) this.killEnemy(e);
      }
    });
  }

  // ═══════════════════════════════════════════════════════
  // LOOT — tiered drops per enemy type
  // ═══════════════════════════════════════════════════════
  // Loot types:
  //   "yellow"  = 1  XP  (small yellow box)
  //   "green"   = 3  XP  (small green box)
  //   "purple"  = 50 XP  (boss orb)

  spawnLootForType(x, y, type) {
    const roll = Phaser.Math.Between(1, 100);

    if (type === "basic") {
      // 70% → 1 yellow, 30% → 2 yellow
      const count = roll <= 70 ? 1 : 2;
      for (let i = 0; i < count; i++) this.spawnOrb(x, y, "yellow");

    } else if (type === "spider") {
      // 70% → 2 yellow, 30% → 3 yellow
      const count = roll <= 70 ? 2 : 3;
      for (let i = 0; i < count; i++) this.spawnOrb(x, y, "yellow");

    } else if (type === "exploder") {
      // 70% → 1 green, 30% → 2 green
      const count = roll <= 70 ? 1 : 2;
      for (let i = 0; i < count; i++) this.spawnOrb(x, y, "green");

    } else if (type === "sniper") {
      // 70% → 2 green, 30% → 3 green  (note: description said "70% drop 1 30% drop 2" but contextually matches 2/3)
      const count = roll <= 70 ? 2 : 3;
      for (let i = 0; i < count; i++) this.spawnOrb(x, y, "green");
    }
  }

  spawnBossLoot(x, y) {
    // Always drops 1 purple orb = 50 XP
    this.spawnOrb(x, y, "purple");
  }

  spawnOrb(x, y, color) {
    const colorMap = { yellow: 0xffff00, green: 0x00ff66, purple: 0xcc44ff };
    const xpMap    = { yellow: 1,        green: 3,        purple: 50 };

    const ox = x + Phaser.Math.Between(-20, 20);
    const oy = y + Phaser.Math.Between(-20, 20);

    const orb = this.add.rectangle(ox, oy, 10, 10, colorMap[color]);
    this.physics.add.existing(orb);
    orb.xpValue = xpMap[color];
    orb.orbColor = color;
    this.loots.add(orb);

    // Luck bonus — extra orb of same type
    if (this.playerLuck > 0 && Phaser.Math.Between(1, 100) <= this.playerLuck) {
      const bx = x + Phaser.Math.Between(-25, 25);
      const by = y + Phaser.Math.Between(-25, 25);
      const bonus = this.add.rectangle(bx, by, 10, 10, colorMap[color]);
      this.physics.add.existing(bonus);
      bonus.xpValue = xpMap[color];
      bonus.orbColor = color;
      this.loots.add(bonus);
    }
  }

  // Legacy fallback (kept for any future calls)
  spawnLoot(x, y) {
    this.spawnOrb(x, y, "yellow");
  }

  handleLoot() {
    this.loots.getChildren().forEach(l => {
      const d = Phaser.Math.Distance.Between(l.x, l.y, this.player.x, this.player.y);
      if (d < this.playerMagnet) this.physics.moveToObject(l, this.player, 250);
      if (d < 20) {
        const xpGain = l.xpValue || 1;
        l.destroy();
        this.gainXP(xpGain);
      }
    });
  }

  // ═══════════════════════════════════════════════════════
  // XP / LEVEL UP
  // ═══════════════════════════════════════════════════════
  gainXP(v) {
    this.xp += v;
    if (this.xp >= this.xpToNext) this.levelUp();
  }

  levelUp() {
    this.pauseGame();
    this.xp -= this.xpToNext;
    this.level++;
    this.xpToNext += 25;

    this.playerMaxHP   += 10;
    this.playerHP       = Math.min(this.playerHP + 10, this.playerMaxHP);
    this.playerHPRegen += 0.5;
    this.playerLuck    += 3;
    this.playerMagnet  += 15;

    const weaponChoices = [];
    weaponChoices.push({ text: "🔫  Bullet DMG +5",      effect: () => { this.bulletDamage += 5; } });
    weaponChoices.push({ text: "⚙️  Fire Rate +10%",      effect: () => { this.fireRate = Math.max(100, this.fireRate * 0.9); this.shootEvent.delay = this.fireRate; } });

    if (!this.hasSword)   weaponChoices.push({ text: "🗡  NEW  Orbiting Sword",  effect: () => { this.addSwordLevel(); } });
    else                  weaponChoices.push({ text: `🗡  Sword  Lv${this.swordLevel} → Lv${this.swordLevel + 1}  (+blade +dmg)`, effect: () => { this.addSwordLevel(); } });

    if (!this.hasEMP)     weaponChoices.push({ text: "⚡  NEW  EMP Pulse",        effect: () => { this.addEMPLevel(); } });
    else                  weaponChoices.push({ text: `⚡  EMP  Lv${this.empLevel} → Lv${this.empLevel + 1}  (+dmg +speed)`, effect: () => { this.addEMPLevel(); } });

    if (!this.hasGrenade) weaponChoices.push({ text: "💣  NEW  Grenade Launcher", effect: () => { this.addGrenadeLevel(); } });
    else                  weaponChoices.push({ text: `💣  Grenade  Lv${this.grenadeLevel} → Lv${this.grenadeLevel + 1}  (+dmg +radius)`, effect: () => { this.addGrenadeLevel(); } });

    const shuffled = Phaser.Utils.Array.Shuffle([...weaponChoices]);
    const choices  = shuffled.slice(0, 3);

    const SW = this.scale.width;
    const SH = this.scale.height;
    const cx = SW / 2;
    const cy = SH / 2;

    const overlay = this.add.rectangle(cx, cy, SW, SH, 0x000000, 0.72)
      .setScrollFactor(0).setDepth(10);

    const title = this.add.text(cx, cy - SH * 0.33, "⬆  LEVEL UP!", {
      fontSize: "30px", fill: "#ffff00", stroke: "#000000", strokeThickness: 4
    }).setOrigin(0.5).setScrollFactor(0).setDepth(11);

    const autoNote = this.add.text(cx, cy - SH * 0.22,
      `Auto: ❤️+10HP  💚+0.5 Regen  🍀+3% Luck  🧲+15 Magnet`,
      { fontSize: "13px", fill: "#aaffaa" }
    ).setOrigin(0.5).setScrollFactor(0).setDepth(11);

    const subTitle = this.add.text(cx, cy - SH * 0.15, "Choose a weapon upgrade:", {
      fontSize: "16px", fill: "#cccccc"
    }).setOrigin(0.5).setScrollFactor(0).setDepth(11);

    this.buttons = [overlay, title, autoNote, subTitle];

    choices.forEach((c, i) => {
      const btn = this.add.text(cx, cy - SH * 0.06 + i * 70, c.text, {
        fontSize: "18px", fill: "#ffffff",
        backgroundColor: "#1a2233",
        padding: { x: 20, y: 14 }
      })
      .setOrigin(0.5).setScrollFactor(0).setDepth(11)
      .setInteractive({ useHandCursor: true })
      .on("pointerover",  () => btn.setStyle({ fill: "#ffff00", backgroundColor: "#2a3a55" }))
      .on("pointerout",   () => btn.setStyle({ fill: "#ffffff", backgroundColor: "#1a2233" }))
      .on("pointerdown",  () => {
        c.effect();
        this.buttons.forEach(b => b.destroy());
        this.resumeGame();
      });
      this.buttons.push(btn);
    });
  }

  // ═══════════════════════════════════════════════════════
  // BOSS DEFEATED BANNER
  // ═══════════════════════════════════════════════════════
  showBossDefeated() {
    const SW = this.scale.width, SH = this.scale.height;
    const msg = this.add.text(SW / 2, SH * 0.28, "🏆  BOSS DEFEATED!", {
      fontSize: "32px", fill: "#cc44ff", stroke: "#000", strokeThickness: 6
    }).setOrigin(0.5).setScrollFactor(0).setDepth(15);
    const sub = this.add.text(SW / 2, SH * 0.28 + 44, "+50 XP — PURPLE ORB DROPPED", {
      fontSize: "16px", fill: "#dd88ff"
    }).setOrigin(0.5).setScrollFactor(0).setDepth(15);
    this.time.delayedCall(3000, () => { msg.destroy(); sub.destroy(); });
  }

  // ═══════════════════════════════════════════════════════
  // DEATH SCREEN
  // ═══════════════════════════════════════════════════════
  showDeathScreen() {
    this.playerHP = 0;
    this.pauseGame();

    const SW = this.scale.width;
    const SH = this.scale.height;
    const cx = SW / 2;
    const cy = SH / 2;

    const sec    = Math.floor(this.gameTime / 1000);
    const mins   = Math.floor(sec / 60);
    const secs   = sec % 60;
    const timeStr = `${mins}m ${secs < 10 ? "0" : ""}${secs}s`;

    const weaponLines = [];
    weaponLines.push(`❤️  Max HP ${this.playerMaxHP}  |  💚 Regen ${this.playerHPRegen.toFixed(1)}/s  |  🍀 Luck ${this.playerLuck}%  |  🧲 Magnet ${this.playerMagnet}px`);
    weaponLines.push(`🔫 Bullet    DMG ${this.bulletDamage}  |  Rate ${(this.fireRate / 1000).toFixed(1)}s`);
    if (this.hasSword)   weaponLines.push(`🗡 Sword     Lv ${this.swordLevel}  |  ${3 + this.swordLevel - 1} blades  |  DMG ${5 + this.swordLevel * 2}/hit`);
    if (this.hasEMP)     weaponLines.push(`⚡ EMP       Lv ${this.empLevel}  |  DMG ${this.empDamage}  |  Rate ${(this.empRate / 1000).toFixed(1)}s`);
    if (this.hasGrenade) weaponLines.push(`💣 Grenade   Lv ${this.grenadeLevel}  |  DMG ${this.grenadeDamage}  |  Radius ${this.grenadeRadius}px  |  Rate ${(this.grenadeRate / 1000).toFixed(1)}s`);

    const overlay = this.add.rectangle(cx, cy, SW, SH, 0x000000, 0.88)
      .setScrollFactor(0).setDepth(20);

    const startY = SH * 0.08;
    const rows = [
      { text: "💀  YOU DIED",                            y: startY,         style: { fontSize: "38px", fill: "#ff3333", stroke: "#000", strokeThickness: 6 } },
      { text: `⏱  Time alive:   ${timeStr}`,             y: startY + 70,    style: { fontSize: "19px", fill: "#ffffff" } },
      { text: `💀  Enemies killed:  ${this.killCount}`,  y: startY + 97,    style: { fontSize: "19px", fill: "#ff8888" } },
      { text: `💥  Total DMG dealt:  ${this.totalDmgDone}`, y: startY + 124, style: { fontSize: "19px", fill: "#ffbb44" } },
      { text: "────── Weapons ──────",                   y: startY + 163,   style: { fontSize: "15px", fill: "#888888" } },
      ...weaponLines.map((t, i) => ({
        text: t,
        y: startY + 189 + i * 26,
        style: { fontSize: "13px", fill: "#ccffcc" }
      })),
    ];

    const deathUI = [overlay];
    rows.forEach(r => {
      deathUI.push(
        this.add.text(cx, r.y, r.text, r.style)
          .setOrigin(0.5, 0).setScrollFactor(0).setDepth(21)
      );
    });

    const btnY = startY + 189 + weaponLines.length * 26 + 30;

    const restartBtn = this.add.text(cx - 100, btnY, "▶  RESTART", {
      fontSize: "20px", fill: "#00ff00", backgroundColor: "#003300", padding: { x: 18, y: 10 }
    })
    .setOrigin(0.5, 0).setScrollFactor(0).setDepth(21)
    .setInteractive({ useHandCursor: true })
    .on("pointerover",  () => restartBtn.setStyle({ fill: "#ffffff" }))
    .on("pointerout",   () => restartBtn.setStyle({ fill: "#00ff00" }))
    .on("pointerdown",  () => this.scene.restart());

    const menuBtn = this.add.text(cx + 100, btnY, "🏠  MENU", {
      fontSize: "20px", fill: "#ffaa00", backgroundColor: "#332200", padding: { x: 18, y: 10 }
    })
    .setOrigin(0.5, 0).setScrollFactor(0).setDepth(21)
    .setInteractive({ useHandCursor: true })
    .on("pointerover",  () => menuBtn.setStyle({ fill: "#ffffff" }))
    .on("pointerout",   () => menuBtn.setStyle({ fill: "#ffaa00" }))
    .on("pointerdown",  () => this.scene.start("HomeScene"));

    deathUI.push(restartBtn, menuBtn);
  }

  // ═══════════════════════════════════════════════════════
  // PAUSE / RESUME
  // ═══════════════════════════════════════════════════════
  pauseGame() {
    this.physics.pause();
    this.isPaused = true;
    this.spawnEvent.paused = true;
    this.shootEvent.paused = true;
    if (this.empEvent)     this.empEvent.paused     = true;
    if (this.grenadeEvent) this.grenadeEvent.paused = true;
    // Hide boss laser while paused
    if (this.boss && this.boss.laserLine) this.boss.laserLine.setVisible(false);
  }

  resumeGame() {
    if (this.pauseUI)  this.pauseUI.forEach(b => b.destroy());
    if (this.buttons)  this.buttons.forEach(b => b.destroy());
    this.physics.resume();
    this.isPaused = false;
    this.spawnEvent.paused = false;
    this.shootEvent.paused = false;
    if (this.empEvent)     this.empEvent.paused     = false;
    if (this.grenadeEvent) this.grenadeEvent.paused = false;
  }

  openPauseMenu() {
    if (this.isPaused) return;
    this.pauseGame();

    const cx = this.scale.width  / 2;
    const cy = this.scale.height / 2;

    this.pauseUI = [
      this.add.text(cx, cy - 50, "CONTINUE", { fontSize: "22px", fill: "#ffffff" })
        .setOrigin(0.5).setScrollFactor(0).setDepth(15).setInteractive()
        .on("pointerdown", () => this.resumeGame()),
      this.add.text(cx, cy,      "RESTART",  { fontSize: "22px", fill: "#ffaa00" })
        .setOrigin(0.5).setScrollFactor(0).setDepth(15).setInteractive()
        .on("pointerdown", () => this.scene.restart()),
      this.add.text(cx, cy + 50, "QUIT",     { fontSize: "22px", fill: "#ff4444" })
        .setOrigin(0.5).setScrollFactor(0).setDepth(15).setInteractive()
        .on("pointerdown", () => this.scene.start("HomeScene")),
    ];
  }

  // ═══════════════════════════════════════════════════════
  // HIT EFFECT
  // ═══════════════════════════════════════════════════════
  hitEffect(e) {
    e.fillColor = 0xffffff;
    this.time.delayedCall(50, () => {
      if (!e.active) return;
      e.fillColor =
        e.type === "boss"     ? 0xff2200 :
        e.type === "spider"   ? 0x00ffff :
        e.type === "exploder" ? 0xff8800 :
        e.type === "sniper"   ? 0x9900ff :
        0xff0000;
    });
  }

  // ═══════════════════════════════════════════════════════
  // UI
  // ═══════════════════════════════════════════════════════
  updateUI() {
    const sec  = Math.floor(this.gameTime / 1000);
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;

    // ── Timer ─────────────────────────────────────────────
    this.ui.time.setText(`${mins}:${secs < 10 ? "0" : ""}${secs}`);

    // ── Bar fills ─────────────────────────────────────────
    if (this.uiBarFills) {
      const PAD  = 10;
      const AVS  = 52;
      const BARW = 148;
      const BARH = 15;
      const BARX = PAD + AVS + 18;
      const BARY1 = PAD + 2;
      const BARY2 = BARY1 + BARH + 5;
      const BARY3 = BARY2 + BARH + 5;

      this.uiBarFills.clear();

      // HP bar — red
      const hpPct = Math.max(0, Math.min(1, this.playerHP / this.playerMaxHP));
      const hpColor = hpPct > 0.5 ? 0x00cc44 : hpPct > 0.25 ? 0xffaa00 : 0xff2222;
      this.uiBarFills.fillStyle(hpColor, 0.9);
      this.uiBarFills.fillRoundedRect(BARX, BARY1, BARW * hpPct, BARH, 3);

      // XP bar — blue
      const xpPct = Math.max(0, Math.min(1, this.xp / this.xpToNext));
      this.uiBarFills.fillStyle(0x2266ff, 0.9);
      this.uiBarFills.fillRoundedRect(BARX, BARY2, BARW * xpPct, BARH, 3);

      // Energy bar — cyan, dim when empty
      const enPct = Math.max(0, Math.min(1, this.energy / this.energyMax));
      const enColor = this.isRunning ? 0x00eeff : (this.energy < 30 ? 0xff8800 : 0x00aacc);
      this.uiBarFills.fillStyle(enColor, 0.9);
      this.uiBarFills.fillRoundedRect(BARX, BARY3, BARW * enPct, BARH, 3);
    }

    // ── Bar texts ─────────────────────────────────────────
    const hpRegen = this.playerHPRegen > 0 ? `  +${this.playerHPRegen.toFixed(1)}/s` : "";
    this.ui.hpText.setText(`${Math.max(0, Math.floor(this.playerHP))}/${this.playerMaxHP}${hpRegen}`);
    this.ui.xpText.setText(`${this.xp}/${this.xpToNext}  Lv${this.level}`);
    const enSuffix = this.isRunning ? " RUN" : "";
    this.ui.energyText.setText(`${Math.floor(this.energy)}/${this.energyMax}${enSuffix}`);

    // ── Weapon slots ──────────────────────────────────────
    // Slot 0: always gun
    // Slots 1-3: optional weapons
    const weapons = [
      { icon: "gun",  lv: null,              active: true },
      { icon: "sword",lv: this.swordLevel,   active: this.hasSword },
      { icon: "emp",  lv: this.empLevel,     active: this.hasEMP },
      { icon: "gren", lv: this.grenadeLevel, active: this.hasGrenade },
    ];
    const iconMap = { gun: ">>", sword: "†", emp: "~", gren: "o" };
    const colorMap = { gun: "#00ffff", sword: "#ffffff", emp: "#88ffff", gren: "#88ff88" };

    weapons.forEach((w, i) => {
      const slot  = this.ui.weaponSlots[i];
      const label = this.ui.weaponLabels[i];
      if (w.active) {
        slot.setText(iconMap[w.icon]);
        slot.setStyle({ fill: colorMap[w.icon], fontSize: "15px", fontStyle: "bold" });
        label.setText(w.lv !== null ? `L${w.lv}` : "");
      } else {
        slot.setText("+");
        slot.setStyle({ fill: "#334455", fontSize: "15px" });
        label.setText("");
      }
    });
  }
}