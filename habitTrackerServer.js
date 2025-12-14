const http = require("http");
const path = require("path");
const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const app = express();
app.set("trust proxy", 1);
const bcrypt = require('bcrypt');
const session = require('express-session');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const MongoStore = require('connect-mongo');
const SALT_ROUNDS = 10;

require("dotenv").config({
    path: path.resolve(__dirname, ".env"),
});

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const portNumber = process.env.PORT || 5001;
console.log(`Web server started and running at http://localhost:${portNumber}`);
const prompt = "Stop to shutdown the server: ";
process.stdin.setEncoding("utf8");
process.stdout.write(prompt);
process.stdin.on("readable", function() {
    const input = process.stdin.read();
    if (input !== null) {
        const command = input.trim().toLowerCase();
        if (command === "stop") {
            process.exit(0);
        }
        process.stdout.write(prompt);
        process.stdin.resume();
    }
});

app.set("view engine", "ejs");
app.set("views", path.resolve(__dirname, "templates"));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({extended:false}));

let database;
async function startServer() {
    const uri = process.env.MONGO_CONNECTION_STRING;
    const client = new MongoClient(uri, { serverApi: ServerApiVersion.v1 });
    try {
        await client.connect();
        database = client.db("HABITTRACKERDB");
        console.log("Connected to MongoDB");

        app.listen(portNumber, () => {
            console.log(`Server running on port ${portNumber}`);
        });
    } catch (e) {
        console.error("Failed to connect to MongoDB:", e);
        process.exit(1);
    }
}
startServer();

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    store: MongoStore.create({
        mongoUrl: process.env.MONGO_CONNECTION_STRING,
        collectionName: 'sessions'
    }),
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 7,
        secure: process.env.IS_LOCAL === "true",
        httpOnly: true,
    }
}));

app.get("/", (req, res) => {
    res.redirect("dashboard");
});

app.get("/login", (req, res) => {
    res.render("login");
});

app.post("/login", async (req, res) => {
    const { email, password } = req.body;

    try {
        const collection = database.collection("users");

        const user = await collection.findOne({ email: email});

        if (!user) {
            return res.render("login", { error: "Invalid email or password." });
        }

        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
            return res.render("login", { error: "Invalid email or password." });
        }

        req.session.userId = user._id;
        req.session.save((err) => {
            if (err) console.error(err);
            if (user.onboarded === true) {
                res.redirect("/dashboard");
            } else {
                res.redirect("/onboarding");
            }
        });

    } catch (e) {
        console.error(e);
        res.render("login", { error: "Unexpected login error occured."});
    }
});

app.get("/createAccount", (req, res) => {
    res.render("createAccount");
});

app.post("/createAccount", async (req, res) => {
    const { email, password } = req.body;

    try {
        const collection = database.collection("users");

        let filter = { email: email };
        const userExists = await collection.findOne(filter);

        if (userExists) {
            throw new Error(`The email ${email} already has an associated account. Please sign in or use a different email.`)
        }

        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
        const newUser = { email: email, password: hashedPassword, onboarded: false };

        let result = await collection.insertOne(newUser);
        console.log(`Inserted User ${email}, User ID: ${result.insertedId}`);

        req.session.userId = result.insertedId;
        req.session.save(() => {
            res.redirect("/onboarding");
        });
    } catch(e) {
        console.error(e);
        res.render("createAccount", { error: e.message });
    }
});

app.get("/onboarding", async (req, res) => {

    console.log("Hello!");

    if (!req.session.userId) {
        return res.redirect("/login");
    }

    try {
        const collection = database.collection("users");
        const user = await collection.findOne({ _id: new ObjectId(req.session.userId) });

        if (user) {
            if (user.onboarded === true) {
                console.log(`User ${user.email} is already onboarded!`);
                return res.redirect("/dashboard");
            } else {
                console.log(`User ${user.email} has not been onboarded`);
            }
        }

        res.render("onboarding");
    } catch (e) {
        console.error("Error checking onboarding status: " + err);
    }
});

app.post("/onboarding", async (req, res) => {
    const { firstName, lastName, zipcode, wearable } = req.body;

    let lat = 0, lon = 0;
    try {
        const isValidZip = await verifyZip(zipcode);
        
        if (isValidZip === null) {
            return res.render("onboarding", { error: "Please enter a valid US Zipcode." });
        }
        lat = isValidZip.data.latitude;
        lon = isValidZip.data.longitude;
    } catch (zipError) {
        console.error("Zip verification failed:", zipError);
        return res.render("onboarding", { error: "Unable to verify zipcode at this time." });
    }

    try {
        const collection = database.collection("users");

        const filter = { _id: new ObjectId(req.session.userId) };
        const toUpdate = {
            $set: {
                firstName: firstName,
                lastName: lastName,
                zipcode: zipcode,
                latitude: lat,
                longitude: lon,
                wearable: wearable,
                onboarded: true
            }
        };

        const updateResult = await collection.updateOne(filter, toUpdate);
        console.log(`User ${req.session.userId} update status: ${updateResult.modifiedCount} document(s) modified.`);
        res.redirect("/dashboard");
    } catch (e) {
        console.error(e);
        res.render("onboarding", { error: "An error occurred while saving your data." });
    }
});

app.get("/forgot-password", (req, res) => {
    res.render("forgotPassword");
});

app.post("/forgot-password", async (req, res) => {
    const { email } = req.body;
    print("Received this email" + email);

    try {
        console.log("Accessing collection!");
        const collection = database.collection("users");
        console.log("Looking for user!");
        const user = await collection.findOne({ email: email });
        if (!user) {
            return res.render("forgotPassword", { message: "If that email exists, we sent you a reset link." });
        }

        console.log("Found user!");

        const token = crypto.randomBytes(32).toString('hex');

        console.log("Waiting to update db");

        await collection.updateOne(
            { email: email },
            {
                $set: {
                    resetToken: token,
                    resetTokenExpiration: Date.now() + 3600000
                }
            }
        );

        console.log("updated db");

        const transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 587,
            secure: true,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });

        const protocol = req.protocol;
        const host = req.get('host');
        const resetLink = `${protocol}://${host}/reset-password/${token}`;

        await transporter.sendMail({
            to: email,
            from: "noreply@habittracker.com",
            subject: "Password Reset",
            html: `<p>You requested a password reset</p>
                   <p>Click this <a href="${resetLink}">link</a> to set a new password.</p>
                   <p>This link expires in 1 hour.</p>`
        });

        res.render("forgotPassword", { message: "Check your email for the reset link!" });

    } catch (e) {
        console.error(e);
        res.render("forgotPassword", { error: "Something went wrong." });
    }
});

app.get("/reset-password/:token", async (req, res) => {
    const token = req.params.token;

    try {
        const collection = database.collection("users");
        const user = await collection.findOne({ 
            resetToken: token, 
            resetTokenExpiration: { $gt: Date.now() } 
        });

        if (!user) {
            return res.render("forgotPassword", { error: "Token is invalid or has expired." });
        }

        res.render("resetPassword", { token: token });
    } catch (e) {
        console.error(e);
    }
});

app.post("/reset-password", async (req, res) => {
    const { token, newPassword, confirmPassword } = req.body;

    if (newPassword !== confirmPassword) {
        return res.render("resetPassword", {
            token: token,
            error: "Passwords do not match. Please try again. "
        });
    }

    try {
        const collection = database.collection("users");

        const filter = { resetToken: token, resetTokenExpiration: { $gt: Date.now() } };
        const user = await collection.findOne(filter);

        if (!user) {
            return res.render("forgotPassword", { error: "Link expired. Please try again." });
        }

        const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);

        await collection.updateOne(
            { _id: user._id },
            {
                $set: { password: hashedPassword },
                $unset: { resetToken: "", resetTokenExpiration: "" }
            }
        );

        res.render("resetSuccess");

    } catch (e) {
        console.error(e);
        res.render("forgotPassword", { error: "Something went wrong. "});
    } 
});

app.get("/reset-success", (req, res) => {
    res.render("resetSuccess")
});

app.get("/dashboard", async (req, res) => {
    if (!req.session.userId) {
        return res.redirect("/login");
    }

    try {
        const collection = database.collection("users");
        const user = await collection.findOne({ _id: new ObjectId(req.session.userId) });

        if (!user) {
            return res.redirect("/login");
        }

        if (user.onboarded !== true) {
            return res.redirect("/onboarding");
        }

        const hour = new Date().getHours();
        let greeting = "Good morning";
        if (hour >= 12) greeting = "Good afternoon";
        if (hour >= 18) greeting = "Good evening";

        let weatherData = {location: "N/A", temp: 0, condition: "Sunny", high: 0, low: 0};

        if (user.latitude && user.longitude) {
            try {
                const apiKey = process.env.WEATHER_API_KEY;
                const url = `https://api.openweathermap.org/data/2.5/weather?lat=${user.latitude}&lon=${user.longitude}&units=imperial&appid=${apiKey}`;

                const response = await fetch(url);
                const data = await response.json();

                if (response.ok) {
                    weatherData.location = data.name;
                    weatherData.temp = Math.round(data.main.temp);
                    weatherData.high = Math.round(data.main.temp_max);
                    weatherData.low = Math.round(data.main.temp_min);
                    if (data.weather && data.weather.length > 0) {
                        const desc = data.weather[0].description
                        weatherData.condition = desc.charAt(0).toUpperCase() + desc.slice(1);
                    }
                } else {
                    console.error("Weather API Error:", data.message);
                }

            } catch (apiError) {
                console.error("Failed to fetch weather: " + apiError);
            }

        }

        res.render("dashboard", {
            user: user,
            greeting: greeting,
            weather: weatherData
        });

    } catch (e) {
        console.error(e);
        res.status(500).send("Server Error");
    } 
});

app.get("/logout", (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error("Error destroying session: " + err);
            return res.status(500).send("Could not log out.");
        }

        res.redirect("/login");
    })
});

app.get("/settings", (req, res) => {
    res.redirect("/settings/general");
});

app.get("/settings/:type", async (req, res) => {
    if (!req.session.userId) {
        return res.redirect("/login");
    }
    
    const tabType = req.params.type;
    const allowedTabs = ["general", "security", "calendar", "wearables"];

    if (!allowedTabs.includes(tabType)) {
        return res.redirect("/settings/general");
    }

    try {
        const collection = database.collection("users");
        const user = await collection.findOne({ _id: new ObjectId(req.session.userId) });

        if (!user) {
            return res.redirect("/login");
        }

        if (user.onboarded !== true) {
            return res.redirect("/onboarding");
        }
        
        res.render("settings", { user: user, activeTab: tabType });
    } catch (e) {
        console.error("Error loading settings: " + e);
        res.redirect("/dashboard");
    }
});

app.post("/settings/update-basic", async (req, res) => {
    if (!req.session.userId) {
        return res.redirect("/login");
    }

    const { firstName, lastName, birthday, gender } = req.body;

    try {
        const collection = database.collection("users");

        const updates = {};
        if (firstName) updates.firstName = firstName;
        if (lastName) updates.lastName = lastName;
        if (birthday) updates.birthday = birthday;
        if (gender) updates.gender = gender;

        await collection.updateOne(
            { _id: new ObjectId(req.session.userId) },
            { $set: updates }
        );

        res.redirect("/settings/general");
    } catch (e) {
        console.error("Error updating basic info: " + e);
        res.redirect("/settings/general");
    }
})

async function verifyZip(zipcode) {
    const API_KEY = process.env.ZIP_VERIFICATION_KEY;
    const url = `https://global.metadapi.com/zipc/v1/zipcodes/${zipcode}`;
    const options = {
        method: 'GET',
        headers: {Accept: 'application/json', 'Ocp-Apim-Subscription-Key': API_KEY}
    };
    
    try {
        const response = await fetch(url, options);
        const data = await response.json();
        if (data.meta.count === 1) {
            return data;
        } else {
            return null;
        }
    } catch (error) {
        console.error(error);
    }
    
}
