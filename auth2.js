    const { OAuth2Client } = require('google-auth-library');
    const express = require('express');
    const router = express.Router();
    const dotenv = require('dotenv');
    const fetch = require('node-fetch');
    const jwt = require('jsonwebtoken');
    const User = require('./models/User');
    const Note = require("./models/Notes");
    const Todos = require("./models/Todos");
    const Mark = require("./models/Marks");
    dotenv.config();


    router.get('/request', (req, res) => {
        const redirectUrl = `${process.env.BACKEND_URL}/oauth`;

        const oAuth2Client = new OAuth2Client(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            redirectUrl
        );
        const authorizeUrl = oAuth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: 'https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email openid',
            prompt: 'consent',
        });

        res.json({ url: authorizeUrl });
    });

    router.get('/oauth', async (req, res) => {
        const { code } = req.query;
        if (!code) {
            return res.status(400).json({ message: 'Authorization code is missing' });
        }

        try {
            const redirectUrl = `${process.env.BACKEND_URL}/oauth`;
            const oAuth2Client = new OAuth2Client(
                process.env.GOOGLE_CLIENT_ID,
                process.env.GOOGLE_CLIENT_SECRET,
                redirectUrl
            );

            const { tokens } = await oAuth2Client.getToken(code);
            oAuth2Client.setCredentials(tokens);

            const userData = await getUserData(oAuth2Client);
            let existingUser = await User.findOne({ googleId: userData.id });
            console.log("Check User ID: " + userData);

            let token;

            if (existingUser) {
                token = jwt.sign(
                    { userId: existingUser._id },
                    process.env.JWT_SECRET,
                    { expiresIn: '1h' }
                );
            } else {
                const newUser = new User({
                    googleId: userData.id,
                    username: userData.email,
                    email: userData.email,
                    name: userData.given_name,
                    surname: userData.family_name,
                    country: null,
                    password: 'googleOAuth',
                    isActive: true,
                });
                const defaultNote = new Note({
                    title: 'Your Node',
                    content:[],
                    creator: newUser._id,
                })
                newUser.notes.push(defaultNote);
                await defaultNote.save();


                const defaultTodo = new Todos({
                    title: 'Your Todo',
                    creator: newUser._id,
                    todos: [
                        { text: 'Set up your first task', done: false },
                        { text: 'Complete your first todo item', done: false },
                        { text: 'Explore the platform features', done: false }
                    ]
                });
                newUser.todos.push(defaultTodo);
                await defaultTodo.save();

                const defaultMark = new Mark({
                    title: "New Folder",
                    creator: newUser._id,
                    marks: [
                        { link: "https://google.com", title: "Google" },
                        { link: "https://example.com", title: "Example" },
                        { link: "https://github.com", title: "GitHub" }
                    ]
                });
                await defaultMark.save();
                newUser.marks.push(defaultMark);
                await newUser.save();

                token = jwt.sign(
                    { userId: newUser._id },
                    process.env.JWT_SECRET,
                    { expiresIn: '1h' }
                );
            }

            res.redirect(`${process.env.CLIENT_URL}?token=${token}`);

        } catch (err) {
            console.error('Error during OAuth callback:', err);
            res.status(500).json({ message: 'Authentication failed', error: err.message });
        }
    });


    async function getUserData(oAuth2Client) {
        const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: {
                Authorization: `Bearer ${oAuth2Client.credentials.access_token}`,
            },
        });
        const data = await response.json();
        console.log('User Data:', data);
        return data;
    }

    module.exports = router;
