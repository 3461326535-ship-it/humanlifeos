// ⚠️ 此文件已废弃，请使用根目录 app.js 作为统一入口
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const eventsRouter = require('./routes/events');
const aiRouter = require('./routes/ai');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, '..')));

app.use('/api/events', eventsRouter);
app.use('/api/ai', aiRouter);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'todo.html'));
});

app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
});