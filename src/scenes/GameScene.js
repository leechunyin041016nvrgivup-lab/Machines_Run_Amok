import * as Phaser from "phaser";

export default class GameScene extends Phaser.Scene {
  constructor() {
    super("GameScene");
  }

  create() {
    // PLAYER
    this.playerHP = 100;
    this.lastDamageTime = 0;

    this.player = this.add.rectangle(400, 300, 40, 40, 0x00ff00);
    this.physics.add.existing(this.player);
    this.player.body.setCollideWorldBounds(true);

    // STATS
    this.moveSpeed = 180;
    this.bulletDamage = 10;
    this.fireRate = 500;

    // XP
    this.xp = 0;
    this.level = 1;
    this.xpToNext = 25;

    // TIMER
    this.gameTime = 0;
    this.isPaused = false;

    // INPUT
    this.keys = this.input.keyboard.addKeys("W,A,S,D,ESC");

    // GROUPS
    this.enemies = this.physics.add.group();
    this.loots = this.physics.add.group();
    this.bullets = this.physics.add.group();

    // SPAWN
    this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => {
        const enemy = this.add.rectangle(
          Phaser.Math.Between(0, 800),
          Phaser.Math.Between(0, 600),
          30, 30, 0xff0000
        );
        this.physics.add.existing(enemy);
        enemy.speed = 50;
        enemy.hp = 30;
        this.enemies.add(enemy);
      }
    });

    // SHOOT
    this.shootEvent = this.time.addEvent({
      delay: this.fireRate,
      loop: true,
      callback: () => this.shootNearestEnemy()
    });

    // DAMAGE
    this.physics.add.overlap(this.player, this.enemies, () => {
      if (this.time.now - this.lastDamageTime > 500) {
        this.playerHP -= 10;
        this.lastDamageTime = this.time.now;

        if (this.playerHP <= 0) {
          this.scene.restart();
        }
      }
    });

    // BULLET HIT
    this.physics.add.overlap(this.bullets, this.enemies, (b, e) => {
      e.hp -= this.bulletDamage;
      b.destroy();
      if (e.hp <= 0) {
        this.spawnLoot(e.x, e.y);
        e.destroy();
      }
    });

    // UI
    this.add.rectangle(0, 0, 220, 150, 0x000000, 0.5).setOrigin(0, 0);

    this.ui = {
      hp: this.add.text(10, 10, ""),
      xp: this.add.text(10, 30, ""),
      dmg: this.add.text(10, 50, ""),
      atk: this.add.text(10, 70, ""),
      spd: this.add.text(10, 90, ""),
      time: this.add.text(10, 110, "")
    };
  }

  update(time, delta) {
    if (!this.isPaused) {
      this.gameTime += delta;
    }

    this.handleMovement();
    this.handleEnemies();
    this.handleLoot();
    this.updateUI();

    if (Phaser.Input.Keyboard.JustDown(this.keys.ESC)) {
      this.togglePauseMenu();
    }
  }

  handleMovement() {
    let vx = 0, vy = 0;

    if (this.keys.A.isDown) vx = -this.moveSpeed;
    if (this.keys.D.isDown) vx = this.moveSpeed;
    if (this.keys.W.isDown) vy = -this.moveSpeed;
    if (this.keys.S.isDown) vy = this.moveSpeed;

    this.player.body.setVelocity(vx, vy);
    if (vx || vy) this.player.body.velocity.normalize().scale(this.moveSpeed);
  }

  handleEnemies() {
    this.enemies.getChildren().forEach(e => {
      this.physics.moveToObject(e, this.player, e.speed);
    });
  }

  shootNearestEnemy() {
    const enemies = this.enemies.getChildren();
    if (!enemies.length) return;

    let closest = enemies[0];
    let min = Infinity;

    enemies.forEach(e => {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, e.x, e.y);
      if (d < min) {
        min = d;
        closest = e;
      }
    });

    const b = this.add.rectangle(this.player.x, this.player.y, 8, 8, 0x00ffff);
    this.physics.add.existing(b);
    this.bullets.add(b);

    this.physics.moveToObject(b, closest, 400);
    this.time.delayedCall(2000, () => b.destroy());
  }

  spawnLoot(x, y) {
    const l = this.add.rectangle(x, y, 10, 10, 0xffff00);
    this.physics.add.existing(l);
    this.loots.add(l);
  }

  handleLoot() {
    this.loots.getChildren().forEach(l => {
      const d = Phaser.Math.Distance.Between(l.x, l.y, this.player.x, this.player.y);

      if (d < 120) this.physics.moveToObject(l, this.player, 250);

      if (d < 20) {
        l.destroy();
        this.gainXP(1);
      }
    });
  }

  gainXP(v) {
    this.xp += v;
    if (this.xp >= this.xpToNext) this.levelUp();
  }

  levelUp() {
    this.physics.pause();
    this.isPaused = true;

    const choices = [
      { text: "Damage +5", effect: () => this.bulletDamage += 5 },
      { text: "Faster Fire", effect: () => this.upgradeFireRate() },
      { text: "Speed +30", effect: () => this.moveSpeed += 30 }
    ];

    this.buttons = choices.map((c, i) =>
      this.add.text(300, 200 + i * 40, c.text)
        .setInteractive()
        .on("pointerdown", () => {
          c.effect();
          this.buttons.forEach(b => b.destroy());
          this.physics.resume();
          this.isPaused = false;
        })
    );
  }

  upgradeFireRate() {
    this.fireRate = Math.max(100, this.fireRate - 100);
    this.shootEvent.remove(false);

    this.shootEvent = this.time.addEvent({
      delay: this.fireRate,
      loop: true,
      callback: () => this.shootNearestEnemy()
    });
  }

  togglePauseMenu() {
    if (!this.isPaused) {
      this.physics.pause();
      this.isPaused = true;

      this.pauseUI = [
        this.add.text(320, 200, "CONTINUE").setInteractive().on("pointerdown", () => this.resumeGame()),
        this.add.text(320, 240, "RESTART").setInteractive().on("pointerdown", () => this.scene.restart()),
        this.add.text(320, 280, "QUIT").setInteractive().on("pointerdown", () => this.scene.start("HomeScene"))
      ];
    }
  }

  resumeGame() {
    this.pauseUI.forEach(b => b.destroy());
    this.physics.resume();
    this.isPaused = false;
  }

  updateUI() {
    this.ui.hp.setText("HP: " + this.playerHP);
    this.ui.xp.setText(`XP: ${this.xp}/${this.xpToNext} | Lv ${this.level}`);
    this.ui.dmg.setText("DMG: " + this.bulletDamage);
    this.ui.atk.setText("ATK: " + (this.fireRate / 1000).toFixed(2) + "s");
    this.ui.spd.setText("SPD: " + this.moveSpeed);

    const seconds = Math.floor(this.gameTime / 1000);
    this.ui.time.setText("TIME: " + seconds + "s");
  }
}