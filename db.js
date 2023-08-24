import { Sequelize, DataTypes } from 'sequelize';

const seq = new Sequelize({
    dialect: 'sqlite',
    storage: 'lib.sqlite'
});

try {
    seq.authenticate();
    console.log('Connection has been established successfully.');
} catch (error) {
    console.error('Unable to connect to the database:', error);
}

export const Messages = seq.define('messages', {
    id: {
        type: DataTypes.MEDIUMINT(),
        autoIncrement: true,
        primaryKey: true,
    },
    key: {
      type: DataTypes.TEXT()
    },
    from_id: {
        type: DataTypes.BIGINT(),
        defaultValue: 0,
    },
    message_id: {
        type: DataTypes.BIGINT(),
        defaultValue: 0,
    },
    file_name: {
        type: DataTypes.TEXT()
    },
    file: {
        type: DataTypes.BLOB()
    }
}, {
    timestamps: false,
    foreignKey: { name:'messages', unique: false }
});

export const Users = seq.define('users', {
    id: {
        type: DataTypes.MEDIUMINT(),
        autoIncrement: true,
        primaryKey: true,
    },
    chat_id: {
        type: DataTypes.BIGINT(),
        defaultValue: 0,
    },
    user_id: {
        type: DataTypes.BIGINT(),
        defaultValue: 0,
    },
    last_key: {
        type: DataTypes.TEXT(),
    },
    state: {
        type: DataTypes.MEDIUMINT(),
        defaultValue: 0,
    },
    last_message_id: {
        type: DataTypes.BIGINT(),
        defaultValue: 0,
    }
}, {
    timestamps: false,
    foreignKey: { name:'users', unique: false }
});
