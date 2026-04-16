import * as Phaser from "phaser";

export default class HomeScene extends Phaser.Scene {
  constructor() {
    super("HomeScene");
  }

  create() {
    this.add.text(250, 150, "Machines Run Amok", {
      fontSize: "32px",
      fill: "#ffffff"
    });

    const startBtn = this.add.text(330, 300, "START GAME", {
      fontSize: "24px",
      fill: "#00ff00"
    })
    .setInteractive()
    .on("pointerdown", () => {
      this.scene.start("GameScene");
    });
  }
}//