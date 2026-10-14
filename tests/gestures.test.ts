import assert from 'node:assert/strict';
import test from 'node:test';
import { GestureRecognizer, type HandPoint } from '../src/gestures.js';

function hand(offset = 0, vertical = 0, pinch = false): HandPoint[] {
  const points = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.7 }));
  points[0] = { x: 0.5, y: 0.85 };
  points[4] = { x: 0.25, y: 0.65 };
  for (const [base, x, top] of [[5, 0.42, 0.32], [9, 0.49, 0.27], [13, 0.56, 0.32], [17, 0.63, 0.42]]) {
    points[base] = { x, y: 0.65 };
    points[base + 1] = { x, y: 0.53 };
    points[base + 2] = { x, y: 0.44 };
    points[base + 3] = { x, y: top };
  }
  if (pinch) points[4] = { x: points[8].x + 0.01, y: points[8].y + 0.01 };
  return points.map(point => ({ x: point.x + offset, y: point.y + vertical }));
}

test('open-palm swipe directions match a mirrored webcam preview', () => {
  const left = new GestureRecognizer();
  assert.equal(left.update(hand(), 0), null);
  assert.equal(left.update(hand(0.14), 100), null);
  assert.equal(left.update(hand(0.28), 200), 'next');
  const right = new GestureRecognizer();
  right.update(hand(), 0);
  right.update(hand(-0.14), 100);
  assert.equal(right.update(hand(-0.28), 200), 'previous');
});

test('jitter and vertical movement do not swipe', () => {
  const jitter = new GestureRecognizer();
  for (let i = 0; i < 30; i++) assert.equal(jitter.update(hand(i % 2 ? 0.03 : -0.03), i * 100), null);
  const vertical = new GestureRecognizer();
  vertical.update(hand(), 0);
  vertical.update(hand(0.14, 0.1), 100);
  assert.equal(vertical.update(hand(0.28, 0.2), 200), null);
});

test('one continuous sweep cannot repeatedly advance products', () => {
  const recognizer = new GestureRecognizer();
  recognizer.update(hand(), 0);
  recognizer.update(hand(0.14), 100);
  assert.equal(recognizer.update(hand(0.28), 200), 'next');
  for (let i = 3; i < 25; i++) assert.equal(recognizer.update(hand(i * 0.14), i * 100), null);
});

test('stationary open palm rearms swipe after cooldown', () => {
  const recognizer = new GestureRecognizer();
  recognizer.update(hand(), 0);
  recognizer.update(hand(0.14), 100);
  assert.equal(recognizer.update(hand(0.28), 200), 'next');
  for (let i = 3; i <= 12; i++) recognizer.update(hand(0.28), i * 100);
  recognizer.update(hand(0.14), 1300);
  assert.equal(recognizer.update(hand(), 1400), 'previous');
});

test('pinch selects after 500ms and requires release before selecting again', () => {
  const recognizer = new GestureRecognizer();
  for (let time = 0; time < 500; time += 100) assert.equal(recognizer.update(hand(0, 0, true), time), null);
  assert.equal(recognizer.update(hand(0, 0, true), 500), 'select');
  for (let time = 600; time <= 2000; time += 100) assert.equal(recognizer.update(hand(0, 0, true), time), null);
  recognizer.update(hand(), 2100);
  for (let time = 2200; time < 2700; time += 100) assert.equal(recognizer.update(hand(0, 0, true), time), null);
  assert.equal(recognizer.update(hand(0, 0, true), 2700), 'select');
});

test('brief tracking loss resets pinch duration but does not rearm an already selected pinch', () => {
  const recognizer = new GestureRecognizer();
  recognizer.update(hand(0, 0, true), 0);
  recognizer.update(hand(0, 0, true), 200);
  recognizer.update(null, 300);
  recognizer.update(hand(0, 0, true), 400);
  assert.equal(recognizer.update(hand(0, 0, true), 600), null);
  assert.equal(recognizer.update(hand(0, 0, true), 900), 'select');
  recognizer.update(null, 1000);
  for (let time = 1100; time <= 2500; time += 100) assert.equal(recognizer.update(hand(0, 0, true), time), null);
});

test('missing hands, invalid landmarks and stale timestamps cannot trigger a swipe', () => {
  const recognizer = new GestureRecognizer();
  recognizer.update(hand(), 100);
  assert.equal(recognizer.update(hand(0.3), 90), null);
  recognizer.update(null, 200);
  assert.equal(recognizer.update(hand(0.3), 300), null);
  const invalid = hand(0.6); invalid[8].x = NaN;
  assert.equal(recognizer.update(invalid, 400), null);
  assert.equal(recognizer.update(hand(0.7), 500), null);
});

test('reset clears pinch latch and prior swipe history for a new session', () => {
  const recognizer = new GestureRecognizer();
  for (let time = 0; time <= 500; time += 100) recognizer.update(hand(0, 0, true), time);
  recognizer.reset();
  for (let time = 600; time < 1100; time += 100) assert.equal(recognizer.update(hand(0, 0, true), time), null);
  assert.equal(recognizer.update(hand(0, 0, true), 1100), 'select');
});
