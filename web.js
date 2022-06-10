import fs from 'fs';
import https from 'https';
import express from 'express';
import bodyParser from 'body-parser';

const app = express();

app.use(bodyParser.json());

app.get('/', function (req, res) {
  res.send('Let the battle begin!');
});

app.post('/', function (req, res) {
  const Orientations = {
    N: { x: 0, y: -1 },
    W: { x: -1, y: 0 },
    S: { x: 0, y: 1 },
    E: { x: 1, y: 0 },
  };
  const Rotations = {
    Front: [[1, 0], [0, 1]],
    Left: [[0, -1], [1, 0]],
    Right: [[0, 1], [-1, 0]],
    Back: [[-1, 0], [0, -1]],
  };
  const Movements = {
    MoveForward: 'F',
    TurnLeft: 'L',
    TurnRight:'R',
    Throw: 'T',
  };

  const selfPlayerId = req.body._links.self.href;
  const [width, height] = req.body.arena.dims;
  const world = [...Array(width).keys()].map(
    (x) => [...Array(height).keys()].map(
      (y) => ({
        x,
        y,
        player: null,
      })
    ),
  );
  const players = [...Object.entries(req.body.arena.state)].map(([playerId, rawPlayer]) => {
    const { x, y, direction: orientation, wasHit, score } = rawPlayer;
    return {
      playerId,
      pos: { x, y },
      dir: Orientations[orientation],
      wasHit,
      score,
    };
  });
  const selfPlayer = players.find((player) => player.playerId === selfPlayerId);

  players.forEach((player) => {
    world[player.pos.x][player.pos.y].player = player;
  });

  const calcCoord = (player, tr, distance) => {
    return {
      x: player.pos.x + (tr[0][0] * player.dir.x + tr[1][0] * player.dir.y) * distance,
      y: player.pos.y + (tr[0][1] * player.dir.x + tr[1][1] * player.dir.y) * distance,
    };
  };
  const isValidCoord = (pos) => {
    return (pos.x >= 0 && pos.x < width && pos.y >= 0 && pos.y < height);
  };
  const isBlocked = (pos) => {
    return !isValidCoord(pos) || world[pos.x][pos.y].player !== null;
  };
  const getPlayerAt = (pos) => {
    if (!isValidCoord(pos)) return null;
    return world[pos.x][pos.y].player;
  };
  const isSelfPlayerInDanger = (tr, distance) => {
    const enemyPlayer = getPlayerAt(calcCoord(selfPlayer, tr, distance));
    if (enemyPlayer === null) return false;
    if (
      enemyPlayer.pos.x + enemyPlayer.dir.x * distance === selfPlayer.pos.x &&
      enemyPlayer.pos.y + enemyPlayer.dir.y * distance === selfPlayer.pos.y
    ) {
      return true;
    }
    return false;
  };
  const randomTurn = () => {
    const leftBlocked = isBlocked(calcCoord(selfPlayer, Rotations.Left, 1));
    const rightBlocked = isBlocked(calcCoord(selfPlayer, Rotations.Right, 1));
    if (leftBlocked !== rightBlocked) {
      if (leftBlocked) return Movements.TurnRight;
      if (rightBlocked) return Movements.TurnLeft;
    }
    return [Movements.TurnLeft, Movements.TurnRight][Math.floor(Math.random() * 2)];
  };

  const move = (() => {
    if ([
      isSelfPlayerInDanger(Rotations.Left, 1),
      isSelfPlayerInDanger(Rotations.Left, 2),
      isSelfPlayerInDanger(Rotations.Left, 3),
      isSelfPlayerInDanger(Rotations.Right, 1),
      isSelfPlayerInDanger(Rotations.Right, 2),
      isSelfPlayerInDanger(Rotations.Right, 3),
    ].some(Boolean)) {
      if (isBlocked(calcCoord(selfPlayer, Rotations.Front, 1))) return randomTurn();
      console.log('Left or Right is in danger, move forward!');
      return Movements.MoveForward;
    }

    if ([
      isSelfPlayerInDanger(Rotations.Back, 3)
    ].some(Boolean)) {
      if (isBlocked(calcCoord(selfPlayer, Rotations.Front, 1))) return randomTurn();
      console.log('Back(3) is in danger, move forward!');
      return Movements.MoveForward;
    }

    if ([
      isSelfPlayerInDanger(Rotations.Back, 1),
      isSelfPlayerInDanger(Rotations.Back, 2),
    ].some(Boolean)) {
      console.log('Back(1,2) is in danger, turn!');
      return randomTurn();
    }

    if ([
      isSelfPlayerInDanger(Rotations.Front, 1),
      isSelfPlayerInDanger(Rotations.Front, 2),
      isSelfPlayerInDanger(Rotations.Front, 3),
    ].some(Boolean)) {
      console.log('Front is in danger, turn!');
      return randomTurn();
    }

    if ([
      getPlayerAt(calcCoord(selfPlayer, Rotations.Front, 1)) !== null,
      getPlayerAt(calcCoord(selfPlayer, Rotations.Front, 2)) !== null,
      getPlayerAt(calcCoord(selfPlayer, Rotations.Front, 3)) !== null,
    ].some(Boolean)) {
      if (Math.random() < 1/10) {
        console.log('Found enemy in the Front, mercy.');
        return randomTurn();
      } else {
        console.log('Found enemy in the Front, attack!');
        return Movements.Throw;
      }
    }

    if (isBlocked(calcCoord(selfPlayer, Rotations.Front, 1))) {
      console.log('Oops, Front is blocked, turn!');
      return randomTurn();
    }

    if (Math.random() < 1/10) {
      console.log('Feel bored, turn.');
      return randomTurn();
    } else {
      console.log('Move forward!');
      return Movements.MoveForward;
    }
  })();

  res.send(move);
});

https.createServer({
  key: fs.readFileSync('key.pem'),
  cert: fs.readFileSync('cert.pem'),
}, app).listen(process.env.PORT || 8443)
