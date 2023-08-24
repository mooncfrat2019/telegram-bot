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
            + 'Личностный тест Майерс-Бриггс:\n'
            + '`/test-mayers`'
            , {parse_mode: 'markdown'});
      }
      await user.update({ last_message_id: msg.message_id });
      await user.save();
    });

    bot.onText(/\/test-mayers/, async (msg) => {
      const [user] = await Users.findOrCreate({ where: { user_id: msg.from.id, chat_id: msg.chat.id }});
      if (user.last_message_id !== msg.message_id) {
        await bot.sendMessage(msg.chat.id, `Привет!
        Это Тест 8.
        Инструкция к тесту: Этот вопросник предназначен для определения типичных способов поведения и личностных характеристик. Он состоит из 70 утверждений (вопросов), каждое из которых имеет два варианта ответа. Вам необходимо выбрать ОДИН. Все ответы равноценны, среди них нет "правильных" или "неправильных"!
        Поэтому не нужно "угадывать" ответ. Выберите ответ, который свойствен вашему поведению в большинстве жизненных ситуаций. Работайте последовательно, не пропуская вопросов. Отвечайте правдиво, если вы хотите узнать что-то о себе, а не о какой-то мифической личности.`
        );
        await bot.sendMessage(msg.chat.id, 'Введите ваше имя:');
      }
      await user.update({ last_message_id: msg.message_id, state: 10 });
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
      if (user.state === 10) {
        await user.update({ name: msg.text, state: 11 })
        await user.save();
        await bot.sendMessage(msg.chat.id, 'Введите ваш email:');
        return
      }
      if (user.state === 11) {
        await user.update({ email: msg.text, state: 12 })
        await user.save();
        await bot.sendMessage(msg.chat.id, 'Начнём? Ответьте на 70 вопросов, обычно это занимает 3-5 минут.',{
          "reply_markup": {
            "keyboard": [["Поехали!"], ["Отмена"]]
          }
        });
        return
      }

      if (user.state === 12) {
        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }
        await user.update({ state: 13 });
        await user.save();
        if (msg.text === 'Поехали!') {
          await user.update({ user_ie: 0, user_sn: 0, user_tf: 0, user_jp: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, '1. В компании (на вечеринке) Вы а) общаетесь со многими, включая и незнакомцев; б) общаетесь с немногими - Вашими знакомыми.',{
            "reply_markup": {
              "keyboard": [["A"], ["B"], ["Отмена"]]
            }
          });
        }

        return
      }

      if (user.state === 13) {
        await user.update({ state: 14 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_ie: user.dataValues.user_ie + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '2. Вы человек скорее а) реалистичный, чем склонный теоретизировать; б) склонный теоретизировать, чем реалистичный. ',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }


      if (user.state === 14) {
        await user.update({ state: 15 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_sn: user.dataValues.user_sn + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '3. По-вашему, что хуже: а) витать в облаках; б) придерживаться проторенной дорожки.',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }


      if (user.state === 15) {
        await user.update({ state: 16 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_sn: user.dataValues.user_sn + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '4. Вы более подвержены влиянию а) принципов, законов; б) эмоций, чувств. ',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }


      if (user.state === 16) {
        await user.update({ state: 17 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_tf: user.dataValues.user_tf + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '5. Вы более склонны а) убеждать; б) затрагивать чувства.',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }

      if (user.state === 17) {
        await user.update({ state: 18 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_tf: user.dataValues.user_tf + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '6. Вы предпочитаете работать а) выполняя все точно в срок; б) не связывая себя определенными сроками. ',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }

      if (user.state === 18) {
        await user.update({ state: 19 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_jp: user.dataValues.user_jp + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '7. Вы склонны делать выбор а) довольно осторожно; б) внезапно, импульсивно.',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }


      if (user.state === 19) {
        await user.update({ state: 20 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_jp: user.dataValues.user_jp + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '8. В компании (на вечеринке) Вы а) остаетесь допоздна, не чувствуя усталости; б) быстро утомляетесь и предпочитаете пораньше уйти.',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }


      if (user.state === 20) {
        await user.update({ state: 21 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_ie: user.dataValues.user_ie + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '9. Вас более привлекают а) здравомыслящие люди; б) люди с богатым воображением. ',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }


      if (user.state === 21) {
        await user.update({ state: 22 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_sn: user.dataValues.user_sn + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '10. Вам интересно а) то, что происходит в действительности; б) те события, которые могут произойти.',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }


      if (user.state === 22) {
        await user.update({ state: 23 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_sn: user.dataValues.user_sn + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '11. Оценивая поступки людей, Вы больше учитываете а) требования закона, чем обстоятельства; б) обстоятельства, чем требования закона. ',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }

      if (user.state === 23) {
        await user.update({ state: 24 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_tf: user.dataValues.user_tf + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '12. Обращаясь к другим, Вы склонны а) соблюдать формальности, этикет; б) проявлять свои личные, индивидуальные качества. ',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }

      if (user.state === 24) {
        await user.update({ state: 25 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_tf: user.dataValues.user_tf + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '13. Вы человек скорее а) точный, пунктуальный; б) неторопливый, медлительный.',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }

      if (user.state === 25) {
        await user.update({ state: 26 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_jp: user.dataValues.user_jp + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '14. Вас больше беспокоит необходимость а) оставлять дела незаконченными; б) непременно доводить дела до конца. ',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }

      if (user.state === 26) {
        await user.update({ state: 27 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_jp: user.dataValues.user_jp + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '15. В кругу знакомых Вы, как правило а) в курсе происходящих событий; б) узнаете о новостях с опозданием.',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }

      if (user.state === 27) {
        await user.update({ state: 28 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_ie: user.dataValues.user_ie + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '16. Повседневные дела Вам нравится делать а) общепринятым способом; б) своим оригинальным способом.',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }

      if (user.state === 28) {
        await user.update({ state: 29 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_sn: user.dataValues.user_sn + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '17. Предпочитаю таких писателей, которые а) выражаются буквально, напрямую; б) пользуются аналогиями, иносказаниями. ',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }

      if (user.state === 29) {
        await user.update({ state: 30 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_sn: user.dataValues.user_sn + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '18. Что Вас больше привлекает а) стройность мысли; б) гармония человеческих отношений. ',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }


      if (user.state === 30) {
        await user.update({ state: 31 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_tf: user.dataValues.user_tf + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '19. Вы чувствуете себя увереннее а) в логических умозаключениях; б) в практических оценках ситуаций. ',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }

      if (user.state === 31) {
        await user.update({ state: 32 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_tf: user.dataValues.user_tf + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '20. Вы предпочитаете, когда дела а) решены и устроены; б) не решены и пока не улажены.',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }

      if (user.state === 32) {
        await user.update({ state: 33 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_jp: user.dataValues.user_jp + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '21. Как по-вашему, Вы человек, скорее а) серьезный, определенный; б) беззаботный, беспечный. ',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }

      if (user.state === 33) {
        await user.update({ state: 34 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_jp: user.dataValues.user_jp + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '22. При телефонных разговорах Вы а) заранее не продумываете все, что нужно сказать; б) мысленно репетируете то, что будет сказано. ',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }

      if (user.state === 34) {
        await user.update({ state: 35 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_ie: user.dataValues.user_ie + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '23. Как Вы считаете, факты а) важны сами по себе; б) есть проявления общих закономерностей. ',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }

      if (user.state === 35) {
        await user.update({ state: 36 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_sn: user.dataValues.user_sn + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '24. Фантазеры, мечтатели обычно а) раздражают Вас; б) довольно симпатичны Вам.',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }

      if (user.state === 36) {
        await user.update({ state: 37 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_sn: user.dataValues.user_sn + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '25. Вы чаще действуете как человек а) хладнокровный; б) вспыльчивый, горячий. ',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }

      if (user.state === 37) {
        await user.update({ state: 38 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_tf: user.dataValues.user_tf + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '26. Как по-вашему, хуже быть а) несправедливым; б) беспощадным.',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }

      if (user.state === 38) {
        await user.update({ state: 39 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_tf: user.dataValues.user_tf + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '27. Обычно Вы предпочитаете действовать а) тщательно взвесив все возможности; б) полагаясь на волю случая. ',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }

      if (user.state === 39) {
        await user.update({ state: 40 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_jp: user.dataValues.user_jp + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '28. Вам приятнее а) покупать что-нибудь; б) иметь возможность купить.',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }

      if (user.state === 40) {
        await user.update({ state: 41 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_jp: user.dataValues.user_jp + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '29. В компании Вы, как правило а) первым заводите беседу; б) ждете, когда с Вами заговорят. ',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }

      if (user.state === 41) {
        await user.update({ state: 42 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_ie: user.dataValues.user_ie + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '30. Здравый смысл а) редко ошибается; б) часто попадает впросак. ',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }


      if (user.state === 42) {
        await user.update({ state: 43 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_sn: user.dataValues.user_sn + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '31. Детям часто не хватает а) практичности; б) воображения. ',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }

      if (user.state === 43) {
        await user.update({ state: 44 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_sn: user.dataValues.user_sn + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '32. В принятии решений Вы руководствуетесь скорее а) принятыми нормами; б) своими чувствами, ощущениями. ',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }

      if (user.state === 44) {
        await user.update({ state: 45 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_tf: user.dataValues.user_tf + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '33. Вы человек скорее а) твердый, чем мягкий; б) мягкий, чем твердый.',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }


      if (user.state === 45) {
        await user.update({ state: 46 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_tf: user.dataValues.user_tf + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '34. Что, по-вашему, больше впечатляет а) умение методично организовать; б) умение приспособиться и довольствоваться достигнутым.',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }

      if (user.state === 46) {
        await user.update({ state: 47 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_jp: user.dataValues.user_jp + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '35. Вы больше цените а) определенность, законченность; б) открытость, многовариантность. ',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }

      if (user.state === 46) {
        await user.update({ state: 47 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_jp: user.dataValues.user_jp + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '36. Новые и нестандартные отношения с людьми а) стимулируют, придают Вам энергии; б} утомляют Вас. ',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }

      if (user.state === 47) {
        await user.update({ state: 48 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_ie: user.dataValues.user_ie + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '37. Вы чаще действуете как а) человек практического склада; б) человек оригинальный, необычный. ',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }

      if (user.state === 48) {
        await user.update({ state: 49 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_sn: user.dataValues.user_sn + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '38. Вы более склонны а) находить пользу в отношениях с людьми; б) понимать мысли и чувства других. ',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }

      if (user.state === 49) {
        await user.update({ state: 50 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_sn: user.dataValues.user_sn + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '39. Что приносит Вам больше удовлетворения а) тщательное и всесторонне обсуждение спорного вопроса; б) достижение соглашения по поводу спорного вопроса. ',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }

      if (user.state === 50) {
        await user.update({ state: 51 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_tf: user.dataValues.user_tf + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '40. Вы руководствуетесь более а) рассудком; б) велениями сердца. ',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }

      if (user.state === 51) {
        await user.update({ state: 52 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_tf: user.dataValues.user_tf + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '41. Вам удобнее выполнять работу а) по предварительной договоренности; б) которая подвернулась случайно. ',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }


      if (user.state === 52) {
        await user.update({ state: 53 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_jp: user.dataValues.user_jp + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '42. Вы обычно полагаетесь а) на организованность, порядок; б) на случайность, неожиданность. ',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }

      if (user.state === 53) {
        await user.update({ state: 54 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_jp: user.dataValues.user_jp + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '43. Вы предпочитаете иметь а) много друзей на непродолжительный срок; б) несколько старых друзей. ',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }

      if (user.state === 54) {
        await user.update({ state: 55 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_ie: user.dataValues.user_ie + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '44. Вы руководствуетесь в большей степени а) фактами, обстоятельствами; б) общими положениями, принципами. ',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }

      if (user.state === 55) {
        await user.update({ state: 56 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_sn: user.dataValues.user_sn + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '45. Вас больше интересуют а) производство и сбыт продукции; б) проектирование и исследования.',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }

      if (user.state === 56) {
        await user.update({ state: 57 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_sn: user.dataValues.user_sn + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '46. Что Вы считаете за комплимент а) *Вот очень логичный человек*; б) *Вот тонко чувствующий человек*. ',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }

      if (user.state === 57) {
        await user.update({ state: 58 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_tf: user.dataValues.user_tf + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '47. Вы более цените в себе а) невозмутимость; б) увлеченность. ',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }

      if (user.state === 58) {
        await user.update({ state: 59 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_tf: user.dataValues.user_tf + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '48. Вы предпочитаете высказывать а) окончательные и определенные утверждения; б) предварительные и неоднозначные утверждения. ',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }

      if (user.state === 59) {
        await user.update({ state: 60 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_jp: user.dataValues.user_jp + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '49. Вы лучше чувствуете себя а) после принятия решения; б) не ограничивая себя решениями. ',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }

      if (user.state === 60) {
        await user.update({ state: 61 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_jp: user.dataValues.user_jp + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '50. Общаясь с незнакомыми, Вы а) легко завязываете продолжительные беседы; б) не всегда находите общие темы для разговора.',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }

      if (user.state === 61) {
        await user.update({ state: 62 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_ie: user.dataValues.user_ie + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '51. Вы больше доверяете а) своему опыту; б) своим предчувствиям. ',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }

      if (user.state === 62) {
        await user.update({ state: 63 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_sn: user.dataValues.user_sn + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '52. Вы чувствуете себя человеком а) более практичным, чем изобретательным; б) более изобретательным, чем практичным. ',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }

      if (user.state === 63) {
        await user.update({ state: 64 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_sn: user.dataValues.user_sn + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '53. Кто заслуживает большего одобрения - а) рассудительный, здравомыслящий человек; б) человек, глубоко переживающий. ',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }

      if (user.state === 64) {
        await user.update({ state: 65 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_tf: user.dataValues.user_tf + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '54. Вы более склонны а) быть прямым и беспристрастным; б) сочувствовать людям. ',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }

      if (user.state === 65) {
        await user.update({ state: 66 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_tf: user.dataValues.user_tf + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '55. Что, по-вашему, предпочтительней а) удостовериться, что все подготовлено и улажено; б) предоставить событиям идти своим чередом.',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }

      if (user.state === 66) {
        await user.update({ state: 67 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_jp: user.dataValues.user_jp + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '56. Отношения между людьми должны строиться а) на предварительной взаимной договоренности; б) в зависимости от обстоятельств. ',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }

      if (user.state === 67) {
        await user.update({ state: 68 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_jp: user.dataValues.user_jp + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '57. Когда звонит телефон, Вы а) торопитесь подойти первым; б) надеетесь, что подойдет кто-нибудь другой. ',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }

      if (user.state === 68) {
        await user.update({ state: 69 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_ie: user.dataValues.user_ie + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '58. Что Вы цените в себе больше а) развитое чувство реальности; б) пылкое воображение. ',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }

      if (user.state === 69) {
        await user.update({ state: 70 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_sn: user.dataValues.user_sn + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '59. Вы больше придаете значение а) тому, что сказано; б) тому, как сказано. ',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }

      if (user.state === 70) {
        await user.update({ state: 71 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_sn: user.dataValues.user_sn + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '60. Вы в основном считаете себя а) трезвым и практичным; б) сердечным и отзывчивым. ',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }

      if (user.state === 71) {
        await user.update({ state: 72 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_tf: user.dataValues.user_tf + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '61. Что выглядит большим заблуждением а) излишняя пылкость, горячность; б) чрезмерная объективность, беспристрастность. ',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }

      if (user.state === 72) {
        await user.update({ state: 73 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_tf: user.dataValues.user_tf + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '62. Какие ситуации привлекают Вас больше а) регламентированные и упорядоченные; б) неупорядоченные и нерегламентированные. ',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }

      if (user.state === 73) {
        await user.update({ state: 74 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_jp: user.dataValues.user_jp + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '63. Вы человек, скорее а) педантичный, чем капризный; б) капризный, чем педантичный. ',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }

      if (user.state === 74) {
        await user.update({ state: 75 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_jp: user.dataValues.user_jp + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '64. Вы чаще склонны а) быть открытым, доступным людям; б) быть сдержанным, скрытным. ',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }

      if (user.state === 75) {
        await user.update({ state: 76 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_ie: user.dataValues.user_ie + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '65. В литературных произведениях Вы предпочитаете а) буквальность, конкретность; б) образность, переносный смысл. ',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }

      if (user.state === 76) {
        await user.update({ state: 77 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_sn: user.dataValues.user_sn + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '66. Что для Вас труднее а) находить общий язык с другими; б) использовать других в своих интересах. ',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }

      if (user.state === 77) {
        await user.update({ state: 78 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_sn: user.dataValues.user_sn + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '67. Чего бы вы себе больше пожелали а) ясности размышлений; б) умения сочувствовать. ',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }

      if (user.state === 78) {
        await user.update({ state: 79 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_tf: user.dataValues.user_tf + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '68. Что хуже а) быть неприхотливым; б) быть излишне привередливым. ',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }

      if (user.state === 79) {
        await user.update({ state: 80 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_tf: user.dataValues.user_tf + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '69. Вы предпочитаете а) запланированные события; б) незапланированные события. ',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }

      if (user.state === 80) {
        await user.update({ state: 81 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_jp: user.dataValues.user_jp + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        await bot.sendMessage(msg.chat.id, '70. Вы склонны поступать скорее а) обдуманно, чем импульсивно; б) импульсивно, чем обдуманно.',{
          "reply_markup": {
            "keyboard": [["A"], ["B"], ["Отмена"]]
          }
        });
        return
      }


      if (user.state === 81) {
        await user.update({ state: 82 });
        await user.save();
        if (msg.text === 'A') {
          await user.update({ user_jp: user.dataValues.user_jp + 1 });
          await user.save();
        }

        if (msg.text === 'Отмена') {
          await user.update({ state: 0 });
          await user.save();
          await bot.sendMessage(msg.chat.id, 'Прохождение теста отменено');
          return
        }

        let user_i;
        let user_n;
        let user_f;
        let user_p;

        if (user.user_ie > 5) {
          user_i = 'E'
        } else {
          user_i = 'I'
        }

        if (user.user_sn > 10) {
          user_n = 'S'
        } else {
          user_n = 'N'
        }

        if (user.user_tf > 10) {
          user_f = 'T'
        } else {
          user_f = 'F'
        }

        if (user.user_jp > 10) {
          user_p = 'J'
        } else {
          user_p = 'P'
        }

        const user_nnnn = user_i+user_n+user_f+user_p;

        const types = {
          ESTJ: 'Тип Администратор: ответственный, надежный; для него важны долг, иерархия, порядок; практичный, открытый, все у него идет по плану; без глупостей и лишних выдумок; бесхитростный, исполнительный, цельная натура. Описание полностью смотрите по адресу: ilyaklishin.ru далее перейдите в People и выбирайте ESTJ. Доступ к скрытым материалам запросите у своего менеджера.',
          ISTJ: 'Тип Инспектор или Опекун: на первом месте - долг, человек слова, ответственный; спокойный, твердый, надежный, логичный, малоэмоциональный; семьянин; ему свойственны обстоятельность и даже въедливость. Описание полностью смотрите по адресу: ilyaklishin.ru далее перейдите в People и выбирайте  Доступ к скрытым материалам запросите у своего менеджера.',
          ISTP: 'Тип Мастер: субординация - излишняя условность; бесстрашие, жажда действий; увлечения с оттенком экстремальности; умение обращаться с любыми инструментами и механизмами; это боевики, наемники; им свойственны братские взаимоотношения; формальное образование не обязательный вариант для них (часто бросают школу и редко стремятся к высшему образованию). Описание полностью смотрите по адресу: ilyaklishin.ru далее перейдите в People и выбирайте  Доступ к скрытым материалам запросите у своего менеджера.',
          ESTP: 'Тип Маршал или Антрепренер: энергия, игра, неистощимый, искушенный в обращении с людьми; остроумие, прагматизм; работа в условиях риска и на грани катастрофы; поиск острых ощущений; преследуют выгоду во взаимоотношениях; погоня за Госпожой Удачей, риск. Описание полностью смотрите по адресу: ilyaklishin.ru далее перейдите в People и выбирайте  Доступ к скрытым материалам запросите у своего менеджера.',
          INTP: 'Тип Критик или Архитектор: ценитель мыслей и языка; мгновенная оценка ситуации, логичность; познание законов природы; интеллектуал, несколько высокомерный, интеллигент, философ, математик, теоретик, неистощимый фонтан новых идей; чуткий и умный родитель; отличается сложным внутренним миром; богатство ассоциаций. Описание полностью смотрите по адресу: ilyaklishin.ru далее перейдите в People и выбирайте   Доступ к скрытым материалам запросите у своего менеджера.',
          ENTP: 'Тип Искатель или Изобретатель": применяет интуицию на практике (в изобретениях), энтузиаст, новатор; важна воплощенная идея, а не идея сама по себе; приятный собеседник, инициативный в общении; нетерпение к банальным, рутинным операциям, хороший педагог; любит юмор; девиз: "Понимать людей"! Описание полностью смотрите по адресу: ilyaklishin.ru далее перейдите в People и выбирайте   Доступ к скрытым материалам запросите у своего менеджера.',
          ENTJ: 'Тип Предприниматель или Фельдмаршал: руководитель-стратег; ориентация на цель; логичный; эффективность в работе превыше всего; хранитель домашнего очага; интеллигент; требовательный родитель, неутомимый; карьера иногда важнее, чем семейное благополучие. Описание полностью смотрите по адресу: ilyaklishin.ru далее перейдите в People и выбирайте    Доступ к скрытым материалам запросите у своего менеджера.',
          INTJ: 'Тип Аналитик или Исследователь: самоуверенный; его интересы в будущем; авторитет положения или звания не имеет значения; теоретик, приверженец "мозгового штурма", жизнь - игра на гигантской шахматной доске; дефицит внешней эмоциональности, высокие способности к обучению, независимость, интуиция; возможны трудности в мире эмоций и чувств. Описание полностью смотрите по адресу: ilyaklishin.ru далее перейдите в People и выбирайте    Доступ к скрытым материалам запросите у своего менеджера.',
          ESFJ: 'Тип Энтузиаст или Торговец: открытый, практичный, расчетливый, обладает житейской мудростью; компанейский, гостеприимный; деловой, ответственный, интересы клиента превыше всего; общительный. Описание полностью смотрите по адресу: ilyaklishin.ru далее перейдите в People и выбирайте   Доступ к скрытым материалам запросите у своего менеджера.',
          ISFJ: 'Тип Хранитель или Консерватор: спокойный; защищает интересы организации, традиции; ответственный; придерживается связи времен, проявляет интерес к истории; все у него по плану; заботливый; выполнять поручения для него спокойнее, чем руководить; хозяин в доме. Описание полностью смотрите по адресу: ilyaklishin.ru далее перейдите в People и выбирайте    Доступ к скрытым материалам запросите у своего менеджера.',
          ISFP: 'Тип Посредник или Художник: успешное художественное творчество, эпикурейский образ жизни; острота ощущения текущей минуты; высокая чувствительность к оттенкам и полутонам в ощущениях; тонкости устной и письменной речи обычно не интересуют; свобода, оптимистичность, непокорность, уход от всякого рода ограничений. Описание полностью смотрите по адресу: ilyaklishin.ru далее перейдите в People и выбирайте   Доступ к скрытым материалам запросите у своего менеджера.',
          ESFP: 'Тип Политик или Тамада: оптимизм и теплота; избегают одиночества; идут по жизни смеясь, жизнь для них - сплошные приключения; игнорируют все мрачное; щедрость, поддаются соблазнам; старший друг для своего ребенка; умение вдохновлять людей, приземленность языка; наука - дело не для них, они выбирают бизнес, торговлю. Описание полностью смотрите по адресу: ilyaklishin.ru далее перейдите в People и выбирайте   Доступ к скрытым материалам запросите у своего менеджера.',
          INFP: 'Тип Лирик или Романтик: спокойный, идеалист; чувство собственного достоинства; борется со злом за идеалы добра и справедливости; отличается лирическим символизмом; это писатель, психолог, архитектор; кто угодно, только не бизнесмен; способности в изучении языков; принцип "Мой дом - моя крепость"; уживчивые и покладистые супруги. Описание полностью смотрите по адресу: ilyaklishin.ru далее перейдите в People и выбирайте   Доступ к скрытым материалам запросите у своего менеджера.',
          ENFP: 'Тип Советчик или Журналист: умение влиять на окружающих; видит людей насквозь; отрывается от реальности в поиске гармонии; подмечает все экстраординарное; ему свойственны чувствительность, отрицание сухой логики, творчество, энтузиазм, оптимизм, богатая фантазия; это торговец, политик, драматург, практический психолог; ему присущи экстравагантность, щедрость, иногда избыточная. Описание полностью смотрите по адресу: ilyaklishin.ru далее перейдите в People и выбирайте   Доступ к скрытым материалам запросите у своего менеджера.',
          ENFJ: 'Тип Наставник или Педагог: гуманистический лидер, общительный, внимательный к чувствам других людей, образцовый родитель; нетерпеливый по отношению к рутине и монотонной деятельности; отличается умением распределить роли в группе. Описание полностью смотрите по адресу: ilyaklishin.ru далее перейдите в People и выбирайте   Доступ к скрытым материалам запросите у своего менеджера.',
          INFJ: 'Тип Гуманист или Предсказатель: радость друзей - радость и для него; проницательность и прозорливость; успешное самообразование; ранимость, не любят споров и конфликтов; богатое воображение, поэтичность, любовь к метафорам; это психолог, врачеватель, писатель; стремится к гармонии человеческих взаимоотношений. Описание полностью смотрите по адресу: ilyaklishin.ru далее перейдите в People и выбирайте   Доступ к скрытым материалам запросите у своего менеджера.',
        }

        await bot.sendMessage(msg.chat.id, `Буквенный код оценки: ${user_nnnn}, Вашей оценкой является балл: ${user.user_ie}${user.user_sn}${user.user_tf}${user.user_jp}`);
        await bot.sendMessage(msg.chat.id, `Помните, что темпераменты и типы - это возможности, а не способности и что существует корреляция.Когда кто-то имеет предпочтение к чему-либо, он склонен много заниматься этим и поэтому развивает свои способности в этом виде деятельности. Тогда вероятно, что предыдущий параграф верен, хотя исключения всегда найдутся. Так что NF может иметь в себе достаточно SР, чтобы быть превосходным в стратегии и лучшим в логистике, чем можно было бы ожидать (хотя логистика бы должна была быть его наименее квалифицированной ролью).
        Спасибо! Тестирование закончилось.
        Результат тестирования: ${types[user_nnnn]}
        `);
        await user.update({ state: 0 });
        await user.save();
        return
      }
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