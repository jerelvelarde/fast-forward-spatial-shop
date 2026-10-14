/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { CameraFeedSystem } from './camera-feed-system.js';
import { TryOnSystem } from './try-on-system.js';
import { mountUi } from './ui.js';
import './style.css';

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  world.registerSystem(CameraFeedSystem);
  world.registerSystem(TryOnSystem);
  mountUi(document.getElementById('app')!, world);
  if (import.meta.env.DEV) Object.assign(window, { __world: world });
}).catch((error) => {
  console.error('IWSDK could not start', error);
  const message = document.createElement('p');
  message.className = 'startup-error';
  message.textContent = 'The try-on view could not start. Reload in a browser with WebGL enabled.';
  document.body.append(message);
});
