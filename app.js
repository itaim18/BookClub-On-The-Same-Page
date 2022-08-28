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
var favicon = require("serve-favicon");
var path = require("path");
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
app.use(favicon(path.join(__dirname, "public", "logo.ico")));
mongoose.connect(
  "mongodb+srv://ItaiM:ASdlkjty65@cluster0.nqhz5.mongodb.net/userDB",
  {
    useNewUrlParser: true,
  },
  { useUnifiedTopology: true }
);
// mongoose.set("useCreateIndex", true);

const commentSchema = new mongoose.Schema({
  commenterName: String,
  commenterNickName: String,
  commenterProfile: String,
  comment: String,
  commentLikes: Number,
});
const postSchema = new mongoose.Schema({
  bookImage: String,
  username: String,
  nickname: String,
  profile: String,
  bookTitle: String,
  review: String,
  date: Date,
  likes: Number,
  comments: commentSchema,
});
const userSchema = new mongoose.Schema({
  nickname: String,
  profile: String,
  password: String,
  googleId: String,
  facebookId: String,
  isPost: Boolean,
  likedPosts: [String],
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

app.get("/unauthorized", function (req, res) {
  res.render("unAuthorized");
});

app.get("/booksFeed", function (req, res) {
  if (req.isAuthenticated()) {
    const renderDate = date.getDate();
    let renderDay = new Date();
    User.find({ isPost: 1 }, function (err, foundUsers) {
      if (err) {
        console.log(err);
      } else {
        if (foundUsers) {
          var availablePosts = [];
          foundUsers.forEach((user) => {
            user.posts.forEach((post) => {
              availablePosts.unshift(post);
            });
          });
          const sortedDesc = availablePosts.sort(
            (objA, objB) => Number(objB.date) - Number(objA.date)
          );
          console.log(sortedDesc);
          res.render("booksFeed", {
            user: req.user,
            postsByDate: sortedDesc,
            postsLikedByUser: req.user.likedPosts,
            usersWithPosts: foundUsers,
            renderDay: renderDay,
            renderDate: renderDate,
          });
        }
      }
    });
  } else {
    res.redirect("/");
  }
});
app.get("/logout", function (req, response) {
  req.logout(function (req, res) {
    response.redirect("/");
  });
});

app.get("/submit", function (req, res) {
  if (req.isAuthenticated()) {
    res.render("submit", { isSearching: true });
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
          var sumOfLikes = 0;
          foundUser.posts.forEach((post) => (sumOfLikes += post.likes));
          console.log(sumOfLikes);
          res.render("account", {
            likesAmount: sumOfLikes,
            articlesAmount: foundUser.posts.length,
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
    var file = req.files.file;
    console.log(file);
    var fileName = file.name;

    file.mv("public/uploads/" + fileName, function (err) {
      if (err) {
        res.send(err);
      } else {
        if (req.body.nickname) {
          User.findByIdAndUpdate(
            req.user.id,
            {
              $set: {
                "posts.$[].profile": "uploads/" + fileName,
                "posts.$[].nickname": `${req.body.nickname}`,
              },
              profile: "uploads/" + fileName,
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
        } else {
          User.findByIdAndUpdate(
            req.user.id,
            {
              profile: "uploads/" + fileName,
              $set: {
                "posts.$[].profile": "uploads/" + fileName,
              },
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
      }
    });
  } else {
    if (req.body.nickname) {
      User.findByIdAndUpdate(
        req.user.id,
        {
          nickname: req.body.nickname,
          $set: {
            "posts.$[].nickname": `${req.body.nickname}`,
          },
        },
        function (err, foundUser) {
          if (err) {
            console.log(err);
          } else {
            res.redirect("/account");
          }
        }
      );
    } else {
      res.redirect("/account");
    }
  }
});

app.post("/booksFeed", async function (req, res) {
  console.log(req.body);
  //check if he liked or commented
  if (req.body.like) {
    //pull out the users that liked it already
    const users = await User.find({
      likedPosts: { $elemMatch: { $in: req.body.like } },
    });
    const postingUser = await User.findOne({
      posts: { $elemMatch: { _id: req.body.like } },
    });

    const isPostLiked = users.length !== 0;

    var isFound = false;
    if (isPostLiked) {
      isFound = users.some((user) => {
        if (user.id === req.user.id) {
          return true;
        }
        return false;
      });
    }

    if (isFound) {
      await User.update(
        { _id: req.user.id },
        { $pull: { likedPosts: req.body.like } }
      );
      await User.findOneAndUpdate(
        { _id: postingUser.id, "posts._id": req.body.like },
        { $inc: { "posts.$.likes": -1 } }
      );
      // res.redirect("/booksFeed");
    } else {
      User.updateOne(
        {
          posts: { $elemMatch: { _id: req.body.like } },
        },
        {
          $inc: { "posts.$.likes": 1 },
        },
        function (err) {
          if (err) {
            console.log(err);
          } else {
            User.updateOne(
              {
                _id: req.user.id,
              },
              {
                $push: { likedPosts: req.body.like },
              },
              function (err) {
                if (err) {
                  console.log(err);
                }
                //  else {
                //   res.redirect("/booksFeed");
                // }
              }
            );
          }
        }
      );
    }
  }
  if (req.body.comment) {
  }
});

app.post("/getBooks", async function (req, res) {
  let payload = req.body.payload.trim();

  let search = await https
    .get(
      "https://openlibrary.org/search.json?q=" + payload + "&limit=5",
      (resp) => {
        let data = "";
        resp.on("data", (chunk) => {
          data += chunk;
        });
        resp.on("end", () => {
          let search = JSON.parse(data);
          console.log(search);
          res.send({ payload: search.docs });
        });
      }
    )
    .on("error", (err) => {
      console.log("Error: " + err.message);
    });
});

app.post("/submit", function (req, res) {
  const submittedReview = req.body.review;
  const bookImage = req.body.bookImg;
  const bookTitle = req.body.bookTitle;

  let postDay = new Date();
  User.findById(req.user.id, function (err, foundUser) {
    if (err) {
      console.log(err);
    } else {
      if (foundUser) {
        foundUser.posts.push({
          username: foundUser.username,
          nickname: foundUser.nickname,
          likes: 0,
          review: submittedReview,
          bookImage: bookImage,
          bookTitle: bookTitle,
          date: postDay,
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
        passport.authenticate("local", { failureRedirect: "/unauthorized" })(
          req,
          res,
          function () {
            res.redirect("/account");
          }
        );
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
      passport.authenticate("local", { failureRedirect: "/unauthorized" })(
        req,
        res,
        function (err) {
          if (err) {
            console.log(err);
          } else {
            res.redirect("/booksFeed");
          }
        }
      );
    }
  });
});

app.listen(3000, function () {
  console.log("Server started on port 3000.");
});
