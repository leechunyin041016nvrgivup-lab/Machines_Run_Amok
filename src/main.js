import * as Phaser from "phaser";
import GameScene from "./scenes/GameScene.js";
import HomeScene from "./scenes/HomeScene.js";

const config = {
  type: Phaser.AUTO,
  width:  window.innerWidth,
  height: window.innerHeight,
  backgroundColor: "#121212",
  physics: {
    default: "arcade",
    arcade: { debug: false }
  },
  scale: {
    mode:       Phaser.Scale.RESIZE,      // always fills the window
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  scene: [HomeScene, GameScene]
};

new Phaser.Game(config);