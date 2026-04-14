import * as Phaser from "phaser";
import GameScene from "./scenes/GameScene.js";

const config = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  backgroundColor: "#121212",
  physics: {
    default: "arcade",
    arcade: {
      debug: true
    }
  },
  scene: [GameScene]
};

new Phaser.Game(config);