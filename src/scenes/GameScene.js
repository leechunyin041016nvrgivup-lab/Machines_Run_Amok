import * as Phaser from "phaser";

export default class GameScene extends Phaser.Scene {
  constructor() {
    super("GameScene");
  }

  create() {
    // ─── SCREEN SIZE (live reference) ─────────────────────
    // Use this.scale.width/height everywhere instead of hardcoded values.
    // These update automatically when the window resizes (RESIZE mode).
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
    this.bulletDamage = 10;
    this.fireRate     = 500;

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
    this.keys = this.input.keyboard.addKeys("W,A,S,D,ESC");

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

  // ── Rebuild HUD on resize so scroll-factor-0 elements stay correct ──
  onResize() {
    if (this.uiContainer) this.uiContainer.destroy();
    this.buildUI();
  }

  buildUI() {
    this.uiContainer = this.add.container(0, 0).setScrollFactor(0).setDepth(5);
    const panelW = Math.min(280, this.scale.width * 0.38);
    const bg = this.add.rectangle(0, 0, panelW, 250, 0x000000, 0.55).setOrigin(0);

    this.ui = {
      hp:     this.add.text(10, 10,  "", { fontSize: "13px", fill: "#ff6666" }),
      regen:  this.add.text(10, 28,  "", { fontSize: "13px", fill: "#66ff99" }),
      luck:   this.add.text(10, 46,  "", { fontSize: "13px", fill: "#ffdd55" }),
      magnet: this.add.text(10, 64,  "", { fontSize: "13px", fill: "#ff88ff" }),
      spd:    this.add.text(10, 82,  "", { fontSize: "13px", fill: "#aaffaa" }),
      xp:     this.add.text(10, 100, "", { fontSize: "13px", fill: "#ffffff" }),
      time:   this.add.text(10, 118, "", { fontSize: "13px", fill: "#ffffff" }),
      kills:  this.add.text(10, 136, "", { fontSize: "13px", fill: "#ff8888" }),
      weps:   this.add.text(10, 154, "", { fontSize: "11px", fill: "#aaaaff" }),
    };

    const btnStyle = { fontSize: "11px", fill: "#ffff00", backgroundColor: "#333300", padding: { x: 4, y: 2 } };

    const lvlUpBtn = this.add.text(10, 182, "LEVEL UP", btnStyle)
      .setScrollFactor(0).setDepth(6)
      .setInteractive({ useHandCursor: true })
      .on("pointerover",  () => lvlUpBtn.setStyle({ fill: "#ffffff" }))
      .on("pointerout",   () => lvlUpBtn.setStyle({ fill: "#ffff00" }))
      .on("pointerdown",  () => this.levelUp());

    const addTimeBtn = this.add.text(140, 182, "[+1 MIN]", btnStyle)
      .setScrollFactor(0).setDepth(6)
      .setInteractive({ useHandCursor: true })
      .on("pointerover",  () => addTimeBtn.setStyle({ fill: "#ffffff" }))
      .on("pointerout",   () => addTimeBtn.setStyle({ fill: "#ffff00" }))
      .on("pointerdown",  () => { this.gameTime += 60000; });

    this.uiContainer.add([bg, ...Object.values(this.ui)]);
  }

  // ═══════════════════════════════════════════════════════
  // UPDATE
  // ═══════════════════════════════════════════════════════
  update(time, delta) {
    if (this.isPaused) return;

    this.gameTime += delta;

    this.handleMovement();
    this.handleEnemies();
    this.handleLoot();
    this.handleRegen(delta);
    this.updateSwords();
    this.updateUI();

    if (Phaser.Input.Keyboard.JustDown(this.keys.ESC)) this.openPauseMenu();
  }

  // ═══════════════════════════════════════════════════════
  // HP REGEN
  // ═══════════════════════════════════════════════════════
  handleRegen(delta) {
    if (this.playerHPRegen <= 0) return;
    this.regenAccum += delta;
    if (this.regenAccum >= 1000) {
      this.regenAccum -= 1000;
      this.playerHP = Math.min(this.playerMaxHP, this.playerHP + this.playerHPRegen);
    }
  }

  // ═══════════════════════════════════════════════════════
  // MOVEMENT
  // ═══════════════════════════════════════════════════════
  handleMovement() {
    if (!this.player.body) return;
    let vx = 0, vy = 0;
    if (this.keys.A.isDown) vx = -this.moveSpeed;
    if (this.keys.D.isDown) vx =  this.moveSpeed;
    if (this.keys.W.isDown) vy = -this.moveSpeed;
    if (this.keys.S.isDown) vy =  this.moveSpeed;
    this.player.body.setVelocity(vx, vy);
    if (vx || vy) this.player.body.velocity.normalize().scale(this.moveSpeed);
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
    e.destroy();
    if (type === "exploder") this.explode(x, y);
    else this.spawnLoot(x, y);
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
  // LOOT
  // ═══════════════════════════════════════════════════════
  spawnLoot(x, y) {
    const l = this.add.rectangle(x, y, 10, 10, 0xffff00);
    this.physics.add.existing(l);
    this.loots.add(l);
    if (this.playerLuck > 0 && Phaser.Math.Between(1, 100) <= this.playerLuck) {
      const bonus = this.add.rectangle(
        x + Phaser.Math.Between(-15, 15),
        y + Phaser.Math.Between(-15, 15),
        10, 10, 0xffd700
      );
      this.physics.add.existing(bonus);
      this.loots.add(bonus);
    }
  }

  handleLoot() {
    this.loots.getChildren().forEach(l => {
      const d = Phaser.Math.Distance.Between(l.x, l.y, this.player.x, this.player.y);
      if (d < this.playerMagnet) this.physics.moveToObject(l, this.player, 250);
      if (d < 20) { l.destroy(); this.gainXP(1); }
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

    // ── Dynamic screen centre ──────────────────────────────
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
  // DEATH SCREEN
  // ═══════════════════════════════════════════════════════
  showDeathScreen() {
    this.playerHP = 0;
    this.pauseGame();

    // ── Always use live screen dimensions ─────────────────
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

    // Rows are positioned relative to the top-centre of the screen
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

    // ── Centre on actual screen ────────────────────────────
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

    this.ui.hp.setText(`❤️  HP: ${Math.max(0, Math.floor(this.playerHP))}/${this.playerMaxHP}`);
    this.ui.regen.setText(`💚  Regen: ${this.playerHPRegen.toFixed(1)}/s`);
    this.ui.luck.setText(`🍀  Luck: ${this.playerLuck}%`);
    this.ui.magnet.setText(`🧲  Magnet: ${this.playerMagnet}px`);
    this.ui.spd.setText(`💨  Speed: ${this.moveSpeed}`);
    this.ui.xp.setText(`XP: ${this.xp}/${this.xpToNext}  |  Lv ${this.level}`);
    this.ui.time.setText(`⏱ ${mins}m ${secs < 10 ? "0" : ""}${secs}s`);
    this.ui.kills.setText(`💀 ${this.killCount} kills   💥 ${this.totalDmgDone} dmg`);

    const wepParts = ["🔫"];
    if (this.hasSword)   wepParts.push(`🗡Lv${this.swordLevel}`);
    if (this.hasEMP)     wepParts.push(`⚡Lv${this.empLevel}`);
    if (this.hasGrenade) wepParts.push(`💣Lv${this.grenadeLevel}`);
    this.ui.weps.setText(wepParts.join("  "));
  }
}