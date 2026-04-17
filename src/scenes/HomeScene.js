import * as Phaser from "phaser";

export default class HomeScene extends Phaser.Scene {
  constructor() {
    super("HomeScene");
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;

    // Rebuild on resize so text stays centred
    this.scale.on("resize", (gameSize) => {
      const nW = gameSize.width;
      const nH = gameSize.height;
      this.children.list.forEach(c => {
        if (c.type === "Text") {
          if (c._tag === "title") c.setPosition(nW / 2, nH * 0.25);
          if (c._tag === "start") c.setPosition(nW / 2, nH * 0.5);
        }
      });
    });

    const title = this.add.text(W / 2, H * 0.25, "Machines Run Amok", {
      fontSize: "32px",
      color: "#ffffff"
    }).setOrigin(0.5);
    title._tag = "title";

    const startBtn = this.add.text(W / 2, H * 0.5, "START GAME", {
      fontSize: "24px",
      color: "#00ff00"
    })
    .setOrigin(0.5)
    .setInteractive({ useHandCursor: true })
    .on("pointerover",  () => startBtn.setStyle({ color: "#ffffff" }))
    .on("pointerout",   () => startBtn.setStyle({ color: "#00ff00" }))
    .on("pointerdown",  () => this.scene.start("GameScene"));
    startBtn._tag = "start";
  }
}