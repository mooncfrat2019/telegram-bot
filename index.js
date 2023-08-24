import TelegramBot from 'node-telegram-bot-api';
import config from './config.json' assert { type: "json" };
import {Messages, Users} from "./db.js";
import axios from "axios";

console.log('Bot started');

const runner = async () => {
  try {
    await Messages.sync();
    await Users.sync();
    //sqlite.connect('library.db');

    /*
    sqlite.run(`CREATE TABLE IF NOT EXISTS messages(
      id  INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      from_id INTEGER NOT NULL,
      message_id INTEGER NOT NULL
    );`, function(res) {
      if (res.error)
        throw res.error;
    });*/

    const token = config.token;

    const bot = new TelegramBot(token, {
      polling: true,
      filepath: false
    });

// Start description
    bot.onText(/\/start/, async (msg) => {
      const [user] = await Users.findOrCreate({ where: { user_id: msg.from.id, chat_id: msg.chat.id }});
      if (user.last_message_id !== msg.message_id) {
        await bot.sendMessage(msg.chat.id, 'This bot allows you to bookmark messages.\n'
            + 'To add message use command:\n'
            + '`/add key`\n'
            + 'To list messages use command:\n'
            + '`/list`\n'
            + 'To remove message use command:\n'
            + '`/remove key`\n'
            , {parse_mode: 'markdown'});
      }
      await user.update({ last_message_id: msg.message_id });
      await user.save();
    });

// Retrieve message from database
    bot.onText(/\/get ([^;'\"]+)/,  async (msg, match) => {
      const key = match[1];
      const message = await getMessage(key);
      if (message.exists) {
        await bot.forwardMessage(msg.chat.id, message.from_id, message.message_id);
      }
    });

// Add message to database
    const addMode = {};
    bot.onText(/\/add ([^;'\"]+)/, async (msg, match) => {
      const [user] = await Users.findOrCreate({ where: { user_id: msg.from.id, chat_id: msg.chat.id }});
      if (user.last_message_id !== msg.message_id) {
        const chatId = msg.chat.id;
        const key = match[1];
        let text = '';
        if (await isMessageExists(key)) {
          text = 'Sorry, message with this key already exists.';
        } else {
          await user.update({ last_key: key, state: 1 });
          await user.save();
          addMode[chatId] = {key: key, from: msg.from.id};
          text = 'Now send me a message that needs to be saved. '
              + 'Or /cancel to abort operation.';
        }
        await bot.sendMessage(chatId, text);
      }
      await user.update({ last_message_id: msg.message_id });
      await user.save();
    });

    bot.on('message', async (msg) => {
      console.log('msg', msg);
      const chatId = msg.chat.id;
      const [user] = await Users.findOrCreate({ where: { user_id: msg.from.id, chat_id: chatId }});
/*      if (!(chatId in addMode)) {
        return;
      }*/
      if (user.state !== 1) return;

      if (msg.text && msg.text.toLowerCase() === "/cancel") {
        await user.update({ state: 0 });
        await user.save();
        delete addMode[msg.chat.id];
        return;
      }

      if (msg?.document) {
        const { data: fileInfo } = await axios.get(`https://api.telegram.org/bot${token}/getFile?file_id=${msg.document.file_id}`);
        const fileName = msg?.document.file_name;
        const { data: file } = await axios.get(`https://api.telegram.org/file/bot${token}/${fileInfo.result.file_path}`);
        try {
          const message = await Messages.create({
            key : user.last_key,
            from_id: user.user_id,
            file_name: fileName,
            file
          });
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(chatId, 'Message successfully saved!');
        } catch (e) {
          console.error(e);
          await bot.sendMessage(chatId, 'Unable to bookmark message. Please, try again later.');
        }
        return
      }
      // const row = addMode[chatId];
      try {
        const message = await Messages.create({
          key : user.last_key,
          from_id: user.user_id,
          message_id: msg.message_id
        });
        await user.update({ state: 0 });
        await user.save();
        await bot.sendMessage(chatId, 'Message successfully saved!');
      } catch (e) {
        console.error(e);
        await bot.sendMessage(chatId, 'Unable to bookmark message. Please, try again later.');
      }

      /*
      sqlite.insert("messages", {
        key : row.key,
        from_id: row.from,
        message_id: msg.message_id
      }, function(res) {
        if (res.error) {
          bot.sendMessage(chatId, 'Unable to bookmark message. Please, try again later.');
          throw res.error;
        }
        bot.sendMessage(chatId, 'Message successfully saved!');
      });*/

      delete addMode[chatId];
    });

// Get list of messages for current user
    bot.onText(/\/list/, async (msg) => {
      const [user] = await Users.findOrCreate({ where: { user_id: msg.from.id, chat_id: msg.chat.id }});
      if (user.last_message_id !== msg.message_id) {
        const chatId = msg.chat.id;
        const fromId = msg.from.id;
        const data = await Messages.findAll({ attributes: ['key'], where: { from_id: fromId }});
        /*const data = sqlite.run(
          "SELECT `key` FROM messages WHERE `from_id` = ?",
           [fromId]);*/
        if (!data.length) {
          await bot.sendMessage(chatId, 'You have not added anything.');
          return;
        }
        let lines = [];
        data.forEach(function(element) {
          lines.push('`' + element.key + '`');
        });
        await bot.sendMessage(chatId, lines.join(', '), {parse_mode: 'markdown'});
      }
      await user.update({ last_message_id: msg.message_id });
      await user.save();
    });

// Remove message from database
    bot.onText(/\/remove ([^;'\"]+)/, async (msg, match) => {
      const [user] = await Users.findOrCreate({ where: { user_id: msg.from.id, chat_id: msg.chat.id }});
      if (user.last_message_id !== msg.message_id) {
        const key = match[1];
        const message = await getMessage(key);
        if (!message.exists) return;
        if (message.from_id !== msg.from.id) return;
        const destroyMessage = await Messages.destroy({ where: { key }})
        if (destroyMessage) {
          await bot.sendMessage(msg.chat.id, 'Message successfully deleted!');
        }
      }
      await user.update({ last_message_id: msg.message_id });
      await user.save();
      /*sqlite.delete('messages', {'key': key}, function(res) {
        if (!res.error) {
          bot.sendMessage(msg.chat.id, 'Message successfully deleted!');
        }
      });*/
    });

    async function isMessageExists(key) {
      return await Messages.findOne({ where: { key } });
      /*
      return sqlite.run(
        "SELECT COUNT(*) as cnt FROM messages WHERE `key` = ?",
         [key])[0].cnt != 0;*/
    }

    async function getMessage(key) {
      const message = await Messages.findOne({ where: { key } })
      /*const data = sqlite.run(
        "SELECT * FROM messages WHERE `key` = ? LIMIT 1",
         [key]);*/
      if (!message || (message && !message.key)) {
        return { exists: false };
      }
      const data = { ...message.dataValues };
      data.exists = true;
      return data;
    }
  } catch (e) {
    console.error(e);
  }

}
runner().catch(e => console.log(e));