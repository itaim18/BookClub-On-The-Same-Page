//jshint esversion:6
const https = require("https");
const upload = require("express-fileupload");
const date = require(__dirname + "/date.js");
require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const mongoose = require("mongoose");
const session = require("express-session");
const passport = require("passport");
const passportLocalMongoose = require("passport-local-mongoose");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const findOrCreate = require("mongoose-findorcreate");
const { boolean } = require("mathjs");
const { JsonWebTokenError } = require("jsonwebtoken");
const FacebookStrategy = require("passport-facebook").Strategy;
const app = express();
app.use(upload());

app.set("view engine", "ejs");
app.use(express.json());
app.use(express.static("public"));

app.use(
  bodyParser.urlencoded({
    extended: true,
  })
);

app.use(
  session({
    secret: "Our little secret.",
    resave: false,
    saveUninitialized: false,
  })
);

app.use(passport.initialize());
app.use(passport.session());

mongoose.connect("mongodb://localhost:27017/userDB", { useNewUrlParser: true });
// mongoose.set("useCreateIndex", true);

const commentSchema = new mongoose.Schema({
  commenterName: String,
  comment: String,
  commentLikes: Number,
});
const postSchema = new mongoose.Schema({
  username: String,
  profile: String,
  bookName: String,
  review: String,
  date: Date,
  likes: Number,
  // comments: commentSchema,
});
const userSchema = new mongoose.Schema({
  nickname: String,
  profile: String,
  password: String,
  googleId: String,
  facebookId: String,
  isPost: Boolean,
  posts: [postSchema],
});

userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findOrCreate);

const User = new mongoose.model("User", userSchema);
const Post = new mongoose.model("Post", postSchema);
const Comment = new mongoose.model("Comment", commentSchema);

passport.use(User.createStrategy());

passport.serializeUser(function (user, done) {
  done(null, user.id);
});

passport.deserializeUser(function (id, done) {
  User.findById(id, function (err, user) {
    done(err, user);
  });
});

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.CLIENT_ID,
      clientSecret: process.env.CLIENT_SECRET,
      callbackURL: "http://localhost:3000/auth/google/bookclub",
      userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo",
    },
    function (accessToken, refreshToken, profile, cb) {
      console.log(profile);

      User.findOrCreate({ googleId: profile.id }, function (err, user) {
        return cb(err, user);
      });
    }
  )
);
passport.use(
  new FacebookStrategy(
    {
      clientID: process.env.CLIENT_ID_FB,
      clientSecret: process.env.CLIENT_SECRET_FB,
      callbackURL: "http://localhost:3000/auth/facebook/bookclub",
    },
    function (accessToken, refreshToken, profile, cb) {
      User.findOrCreate({ facebookId: profile.id }, function (err, user) {
        return cb(err, user);
      });
    }
  )
);

app.get("/", function (req, res) {
  res.render("home");
});

app.get("/auth/facebook", passport.authenticate("facebook"));

app.get(
  "/auth/facebook/bookclub",
  passport.authenticate("facebook", { failureRedirect: "/" }),
  function (req, res) {
    // Successful authentication, redirect home.
    res.redirect("/booksFeed");
  }
);

app.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile"] })
);

app.get(
  "/auth/google/bookclub",
  passport.authenticate("google", { failureRedirect: "/" }),
  function (req, res) {
    // Successful authentication, redirect to secrets.
    res.redirect("/booksFeed");
  }
);

app.get("/register", function (req, res) {
  res.render("register");
});

app.get("/booksFeed", function (req, res) {
  const renderDate = date.getDate();
  let renderDay = new Date();
  User.find({ isPost: 1 }, function (err, foundUsers) {
    if (err) {
      console.log(err);
    } else {
      if (foundUsers) {
        res.render("booksFeed", {
          usersWithPosts: foundUsers,
          renderDay: renderDay,
          renderDate: renderDate,
        });
      }
    }
  });
});
app.get("/logout", function (req, response) {
  req.logout(function (req, res) {
    response.redirect("/");
  });
});

app.get("/submit", function (req, res) {
  if (req.isAuthenticated()) {
    res.render("submit");
  } else {
    res.redirect("/");
  }
});

app.get("/account", function (req, res) {
  if (req.isAuthenticated()) {
    User.findById(req.user.id, function (err, foundUser) {
      if (err) {
        console.log(err);
      } else {
        if (foundUser) {
          res.render("account", {
            profileImage: foundUser.profile,
            username: foundUser.username,
            nickname: foundUser.nickname,
          });
        }
      }
    });
  } else {
    res.redirect("/");
  }
});

app.post("/account", function (req, res) {
  if (req.files) {
    var file = req.files.image_input;
    var fileName = file.name;

    file.mv("public/uploads/" + fileName, function (err) {
      if (err) {
        res.send(err);
      } else {
        User.findByIdAndUpdate(
          req.user._id,
          {
            profile: "uploads/" + fileName,
          },
          function (err, foundUser) {
            if (err) {
              console.log(err);
            } else {
              res.redirect("/account");
            }
          }
        );
      }
    });
  }
  User.findByIdAndUpdate(
    req.user._id,
    {
      nickname: req.body.nickname,
    },
    function (err, foundUser) {
      if (err) {
        console.log(err);
      } else {
        res.redirect("/account");
      }
    }
  );
});

app.post("/getBooks", async function (req, res) {
  let payload = req.body.payload.trim();
  let search = await https
    .get(
      "https://www.googleapis.com/books/v1/volumes?q=" +
        payload +
        "&maxResults=5&key=AIzaSyBTk4ljv4cbfL5PLe2jV9xhjTiVRpkJ9SQ",
      (resp) => {
        let data = "";
        resp.on("data", (chunk) => {
          data += chunk;
        });
        resp.on("end", () => {
          let search = JSON.parse(data).items;

          res.send({ payload: search });
        });
      }
    )
    .on("error", (err) => {
      console.log("Error: " + err.message);
    });
  console.log(payload);
});
app.post("/submit", function (req, res) {
  const submittedReview = req.body.review;
  let postDay = new Date();
  User.findById(req.user.id, function (err, foundUser) {
    if (err) {
      console.log(err);
    } else {
      if (foundUser) {
        foundUser.posts.push({
          date: postDay,
          review: submittedReview,
          profile: foundUser.profile,
        });
        foundUser.isPost = 1;
        foundUser.save(function () {
          res.redirect("/booksFeed");
        });
      }
    }
  });
});
// app.post("/booksFeed", function (req, res) {
//   User.update(
//     { username: req.params.username },
//     { post: { likes: likes + 1 } },
//     { overwrite: true },
//     function (err) {
//       if (!err) {
//         res.redirect("/booksFeed");
//       }
//     }
//   );
// });
app.post("/register", function (req, res) {
  User.register(
    {
      username: req.body.username,
      nickname: "ReaderLeader",
      profile: "images/profile-bookclub.png",
      isPost: 0,
    },
    req.body.password,
    function (err, user) {
      if (err) {
        console.log(err);
        res.redirect("/register");
      } else {
        passport.authenticate("local")(req, res, function () {
          res.redirect("/account");
        });
      }
    }
  );
});

app.post("/", function (req, res) {
  const user = new User({
    username: req.body.username,
    password: req.body.password,
  });

  req.login(user, function (err) {
    if (err) {
      console.log(err);
    } else {
      passport.authenticate("local")(req, res, function () {
        res.redirect("/booksFeed");
      });
    }
  });
});

app.listen(3000, function () {
  console.log("Server started on port 3000.");
});
