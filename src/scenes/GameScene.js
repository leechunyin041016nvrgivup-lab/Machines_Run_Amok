import * as Phaser from "phaser";

export default class GameScene extends Phaser.Scene {
  constructor() {
    super("GameScene");
  }

  preload() {
    // temporary shapes later
  }

  create() {
    // player (temporary square)
    this.player = this.add.rectangle(400, 300, 40, 40, 0x00ff00);
    this.physics.add.existing(this.player);

    this.player.body.setCollideWorldBounds(true);

    // input
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys("W,A,S,D");

    // enemy group
    this.enemies = this.physics.add.group();

    // spawn enemies
    this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => {
        let x = Phaser.Math.Between(0, 800);
        let y = Phaser.Math.Between(0, 600);

        let enemy = this.add.rectangle(x, y, 30, 30, 0xff0000);
        this.physics.add.existing(enemy);

        enemy.speed = 50;
        this.enemies.add(enemy);
      }
    });
  }

  update() {
    const speed = 180;

    let vx = 0;
    let vy = 0;

    if (this.cursors.left.isDown || this.keys.A.isDown) vx = -speed;
    if (this.cursors.right.isDown || this.keys.D.isDown) vx = speed;
    if (this.cursors.up.isDown || this.keys.W.isDown) vy = -speed;
    if (this.cursors.down.isDown || this.keys.S.isDown) vy = speed;

    this.player.body.setVelocity(vx, vy);
    this.player.body.velocity.normalize().scale(speed);

    // enemies follow player
    this.enemies.getChildren().forEach(enemy => {
      this.physics.moveToObject(enemy, this.player, enemy.speed);
    });
  }
}