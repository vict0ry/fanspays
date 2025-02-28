const express = require('express');
const app = express();
const port = 3003;
const middleware = require('./middleware')
const path = require('path')
const bodyParser = require("body-parser")
const mongoose = require("./database");
const session = require("express-session");
const stripe = require("stripe")('sk_test_51LHjpdEZZiK54waal5CeD2qHjc9P5LV7sUqFgUsJ8Vi8EwSkNzGD1XQBEVPCxcKcgabBa8WxdUmWryAs6evDl0Ra00vjb96Cqe');

const server = app.listen(port, () => console.log("Server listening on port " + port));
const io = require("socket.io")(server, {
    pingTimeout: 60000,
    cors: {
        origin: '*',
    }
});

app.set("view engine", "pug");
app.set("views", "views");

app.use(bodyParser.urlencoded({extended: false}));
app.use(express.static(path.join(__dirname, "public")));

app.use(session({
    secret: "bbq chips",
    resave: true,
    saveUninitialized: false
}))

// Routes
const loginRoute = require('./routes/loginRoutes');
const registerRoute = require('./routes/registerRoutes');
const logoutRoute = require('./routes/logout');
const postRoute = require('./routes/postRoutes');
const profileRoute = require('./routes/profileRoutes');
const uploadRoute = require('./routes/uploadRoutes');
const searchRoute = require('./routes/searchRoutes');
const messagesRoute = require('./routes/messagesRoutes');
const notificationsRoute = require('./routes/notificationRoutes');
// Api routes
const postsApiRoute = require('./routes/api/posts');
const usersApiRoute = require('./routes/api/users');
const chatsApiRoute = require('./routes/api/chats');
const shopApiRoute = require('./routes/api/shop');
const messagesApiRoute = require('./routes/api/messages');
const notificationsApiRoute = require('./routes/api/notifications');
const commentsApiRoute = require('./routes/api/comments');
const creditApiRoute = require('./routes/api/credit');
const wishApiRoute = require('./routes/api/wish');
const stripeApiRoute = require('./routes/api/stripe');
const validationsRoute = require('./routes/api/validations');
const demandsApiRoute = require('./routes/api/demands');



const cors = require("cors");

app.use(cors())
app.use(bodyParser.json());
app.use("/login", loginRoute);
app.use("/register", registerRoute);
app.use("/logout", logoutRoute);
app.use("/posts", middleware.requireLogin, postRoute);
app.use("/profile", middleware.requireLogin, profileRoute);
app.use("/uploads", uploadRoute);
app.use("/search", middleware.requireLogin, searchRoute);
app.use("/messages", middleware.requireLogin, messagesRoute);
app.use("/notifications", middleware.requireLogin, notificationsRoute);
app.use("/api/shop", middleware.requireLogin, shopApiRoute);
app.use("/api/demands", middleware.requireLogin, demandsApiRoute);
app.use("/api/wish", middleware.requireLogin, wishApiRoute);


app.use("/api/posts", middleware.requireLogin, postsApiRoute);
app.use("/api/users", middleware.requireLogin, usersApiRoute);
app.use("/api/credit", middleware.requireLogin, creditApiRoute);
app.use("/api/chats", middleware.requireLogin, chatsApiRoute);
app.use("/api/messages", middleware.requireLogin, messagesApiRoute);
app.use("/api/notifications", middleware.requireLogin, notificationsApiRoute);
app.use("/api/comments", middleware.requireLogin, commentsApiRoute);
app.use('/api/stripe', middleware.requireLogin, stripeApiRoute);
app.use('/validations', validationsRoute);

const users = [];

io.on("connection", socket => {
    socket.on("setup", userData => {
        const existUser = users.map(i => i.userId).indexOf(userData._id);
        if (existUser >= 0) {
            users[existUser].socketId = socket.id;
        } else {
            users.push({
                socketId: socket.id,
                userId: userData._id
            });
            socket.join(userData._id);
        }
        socket.emit("connected", socket.id);
    });
    socket.on('disconnect',() => {
        for(let i=0; i < users.length; i++) {

            if(users[i].id === socket.id){
                users.splice(i,1);
            }
        }
        io.emit('exit', users);
        console.log(users);
    });


    socket.on("join room", room => {
        console.log('room joined: ', room);
        return socket.join(room);
    });
    socket.on("typing", room => socket.in(room).emit("typing"));
    socket.on("stop typing", room => socket.in(room).emit("stop typing"));
    socket.on("notification received", room => {
        console.log('room number chachachas: ', room);
        return socket.in(room).emit("notification received");
    });

    socket.on("message_sent", data => {
        console.log('message_sent:!!', data)
        console.log('users ', users);
        const foundUser = users.find(user => user.userId === data.userId);
        console.log('foundUser : ', foundUser);
        if (foundUser) {
            console.log('no aspon tady..')
            console.log('sent to : ', foundUser.socketId);
            socket.to(foundUser.socketId).emit('sendMsg', data);
        }
    })

    socket.on("new message", newMessage => {
        const chat = newMessage.chat;

        if (!chat.users) return console.log("Chat.users not defined");

        chat.users.forEach(user => {
            if (user._id === newMessage.sender._id) return;
            socket.in(user._id).emit("message received", newMessage);
        })
    });

})
