import { Game } from './core/Game';
import { playgama } from './platform/PlaygamaService';
import { saveService } from './platform/SaveService';

async function bootstrap(): Promise<void> {
  // 1. Wait for Playgama Bridge initialization (with local mock fallback)
  await playgama.initialize();

  // 2. Load player progress in a single call from bridge.storage
  await saveService.load();

  // 3. Create & initialize 3D game world
  const container = document.getElementById('canvas-container');
  if (!container) {
    throw new Error('Missing #canvas-container');
  }

  const game = new Game(container);
  await game.init();

  // 4. Notify Playgama platform that the game is interactive and ready
  playgama.sendGameReady();
}

void bootstrap();
