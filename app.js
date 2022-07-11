const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");
let database = null;

const initializeDbAndServer = async () => {
  try {
    database = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000);
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const getUserQuery = `SELECT *
                        FROM user
                        WHERE username = '${username}';`;
  const userData = await database.get(getUserQuery);
  if (userData === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const insertUserQuery = `INSERT INTO user
                                (name,username,password,gender)
                                VALUES ('${name}', '${username}', '${hashedPassword}', '${gender}');`;
      await database.run(insertUserQuery);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const getUserQuery = `SELECT *
                        FROM user
                        WHERE username = '${username}';`;
  const userData = await database.get(getUserQuery);
  if (userData === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordValid = await bcrypt.compare(password, userData.password);
    if (isPasswordValid === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "My_Secrete_Key");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

const authenticatingToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "My_Secrete_Key", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

app.get(
  "/user/tweets/feed/",
  authenticatingToken,
  async (request, response) => {
    const { username } = request;
    const getUserQuery = `SELECT *
                                FROM user
                                WHERE username = '${username}';`;
    const userData = await database.get(getUserQuery);
    const userId = userData.user_id;
    const getUserTweetsQuery = `SELECT user.username,tweet.tweet,tweet.date_time AS dateTime
                                FROM user
                                INNER JOIN follower ON user.user_id = follower.following_user_id
                                INNER JOIN tweet ON follower.following_user_id = tweet.user_id
                                WHERE follower.follower_user_id = ${userId}
                                ORDER BY tweet.date_time DESC
                                LIMIT 4;`;
    const tweetsArray = await database.all(getUserTweetsQuery);
    response.send(tweetsArray);
  }
);

app.get("/user/following/", authenticatingToken, async (request, response) => {
  const { username } = request;
  const getUserQuery = `SELECT *
                                FROM user
                                WHERE username = '${username}';`;
  const userData = await database.get(getUserQuery);
  const userId = userData.user_id;
  const getUserTweetsQuery = `SELECT user.name
                                FROM user
                                INNER JOIN follower ON user.user_id = follower.following_user_id
                                WHERE follower.follower_user_id = ${userId};`;
  const tweetsArray = await database.all(getUserTweetsQuery);
  response.send(tweetsArray);
});

app.get("/user/followers/", authenticatingToken, async (request, response) => {
  const { username } = request;
  const getUserQuery = `SELECT *
                                FROM user
                                WHERE username = '${username}';`;
  const userData = await database.get(getUserQuery);
  const userId = userData.user_id;
  const getUserTweetsQuery = `SELECT user.name
                                FROM user
                                INNER JOIN follower ON user.user_id = follower.follower_user_id
                                WHERE follower.following_user_id = ${userId};`;
  const tweetsArray = await database.all(getUserTweetsQuery);
  response.send(tweetsArray);
});

const checkUserFollowers = async (request, response, next) => {
  const { tweetId } = request.params;
  const { username } = request;
  const getUserDetails = `SELECT *
                            FROM user
                            WHERE username = '${username}';`;
  const userData = await database.get(getUserDetails);
  const userId = userData.user_id;
  const getTweetUserQuery = `SELECT user.username
                                FROM user
                                JOIN follower ON user.user_id = follower.following_user_id
                                JOIN tweet ON follower.following_user_id = tweet.user_id
                                WHERE tweet.tweet_id = ${tweetId}
                                AND follower.follower_user_id = ${userId};`;
  const checkingUserFollowing = await database.get(getTweetUserQuery);
  if (checkingUserFollowing === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    next();
  }
};

app.get(
  "/tweets/:tweetId/",
  authenticatingToken,
  checkUserFollowers,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const getUserQuery = `SELECT *
                                FROM user
                                WHERE username = '${username}';`;
    const userData = await database.get(getUserQuery);
    const userId = userData.user_id;
    const getTweetsQuery = `SELECT tweet.tweet, COUNT(DISTINCT like.like_id) AS likes, COUNT(DISTINCT reply.reply_id) AS replies, tweet.date_time AS dateTime
                        FROM follower
                        JOIN tweet ON tweet.user_id = follower.following_user_id
                        JOIN reply ON tweet.tweet_id = reply.tweet_id
                        JOIN like ON tweet.tweet_id = like.tweet_id
                        WHERE tweet.tweet_id = ${tweetId}
                        GROUP BY follower.follower_user_id
                        HAVING follower.follower_user_id = ${userId};`;
    const tweetsArray = await database.get(getTweetsQuery);
    response.send(tweetsArray);
  }
);

const objectToArray = (dbObject) => {
  let namesArray = [];
  for (eachObject of dbObject) {
    namesArray.push(eachObject["username"]);
  }
  return { likes: namesArray };
};

app.get(
  "/tweets/:tweetId/likes/",
  authenticatingToken,
  checkUserFollowers,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const getUserQuery = `SELECT *
                                FROM user
                                WHERE username = '${username}';`;
    const userData = await database.get(getUserQuery);
    const userId = userData.user_id;
    const getLikesQuery = `SELECT  user.username
                        FROM tweet
                        INNER JOIN follower ON following_user_id = tweet.user_id
                        INNER JOIN like ON like.tweet_id = tweet.tweet_id
                        INNER JOIN user ON user.user_id = like.user_id
                        WHERE tweet.tweet_id = ${tweetId}
                        AND follower.follower_user_id = ${userId};`;
    const likesArray = await database.all(getLikesQuery);
    response.send(objectToArray(likesArray));
  }
);

const convertReplyAndUserToResponseObject = (dbObject) => {
  arrayOfReplyAndUsers = [];
  for (eachObject of dbObject) {
    arrayOfReplyAndUsers.push(eachObject);
  }
  return { replies: arrayOfReplyAndUsers };
};

app.get(
  "/tweets/:tweetId/replies/",
  authenticatingToken,
  checkUserFollowers,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const getUserQuery = `SELECT *
                                FROM user
                                WHERE username = '${username}';`;
    const userData = await database.get(getUserQuery);
    const userId = userData.user_id;
    const getRepliesQuery = `SELECT  user.name,reply.reply
                        FROM tweet
                        INNER JOIN reply ON tweet.tweet_id = reply.tweet_id
                        INNER JOIN user ON user.user_id = reply.user_id
                        INNER JOIN follower ON user.user_id = follower.following_user_id
                        WHERE tweet.tweet_id = ${tweetId}
                        AND follower.follower_user_id = ${userId};`;
    const repliesArray = await database.all(getRepliesQuery);
    response.send(convertReplyAndUserToResponseObject(repliesArray));
  }
);

app.get("/user/tweets/", authenticatingToken, async (request, response) => {
  const { username } = request;
  const getUserQuery = `SELECT *
                                FROM user
                                WHERE username = '${username}';`;
  const userData = await database.get(getUserQuery);
  const userId = userData.user_id;
  const getTweetsQuery = `SELECT tweet.tweet, COUNT(DISTINCT like.like_id) AS likes, COUNT(DISTINCT reply.reply_id) AS replies, tweet.date_time AS dateTime
                        FROM tweet
                        LEFT JOIN reply ON tweet.tweet_id = reply.tweet_id
                        LEFT JOIN like ON tweet.tweet_id = like.tweet_id
                        WHERE tweet.user_id = ${userId}
                        GROUP BY tweet.tweet_id;`;
  const tweetsArray = await database.all(getTweetsQuery);
  response.send(tweetsArray);
});

app.post("/user/tweets/", authenticatingToken, async (request, response) => {
  const { tweet } = request.body;
  const { username } = request;
  const getUserQuery = `SELECT *
                                FROM user
                                WHERE username = '${username}';`;
  const userData = await database.get(getUserQuery);
  const userId = userData.user_id;
  const insertTweetQuery = `INSERT INTO tweet
                                (tweet,user_id) VALUES ('${tweet}',${userId});`;
  await database.run(insertTweetQuery);
  response.send("Created a Tweet");
});

app.delete(
  "/tweets/:tweetId/",
  authenticatingToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const getTweetQuery = `SELECT *
                            FROM user
                            JOIN tweet ON tweet.user_id = user.user_id
                            WHERE tweet.tweet_id = ${tweetId}
                            AND user.username = '${username}';`;
    const tweetDetails = await database.get(getTweetQuery);
    if (tweetDetails === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const deleteTweetQuery = `DELETE FROM tweet
                                    WHERE tweet_id = ${tweetId};`;
      await database.run(deleteTweetQuery);
      response.send("Tweet Removed");
    }
  }
);

module.exports = app;

// const express = require("express");
// const path = require("path");
// const { open } = require("sqlite");
// const sqlite3 = require("sqlite3");
// const jwt = require("jsonwebtoken");
// const bcrypt = require("bcrypt");
// const { format, compareAsc } = require("date-fns");

// const app = express();
// app.use(express.json());

// const dbPath = path.join(__dirname, "twitterClone.db");
// let database = null;

// const initializeDbAndServer = async () => {
//   try {
//     database = await open({
//       filename: dbPath,
//       driver: sqlite3.Database,
//     });
//     app.listen(3000);
//   } catch (e) {
//     console.log(`DB Error: ${e.message}`);
//     process.exit(1);
//   }
// };

// initializeDbAndServer();

// app.post("/register/", async (request, response) => {
//   const { username, password, name, gender } = request.body;
//   const hashedPassword = await bcrypt.hash(password, 10);
//   const getUserQuery = `SELECT *
//                         FROM user
//                         WHERE username = '${username}';`;
//   const userData = await database.get(getUserQuery);
//   if (userData === undefined) {
//     if (password.length < 6) {
//       response.status(400);
//       response.send("Password is too short");
//     } else {
//       const insertUserQuery = `INSERT INTO user
//                                 (name,username,password,gender)
//                                 VALUES ('${name}', '${username}', '${hashedPassword}', '${gender}');`;
//       await database.run(insertUserQuery);
//       response.send("User created successfully");
//     }
//   } else {
//     response.status(400);
//     response.send("User already exists");
//   }
// });

// app.post("/login/", async (request, response) => {
//   const { username, password } = request.body;
//   const getUserQuery = `SELECT *
//                         FROM user
//                         WHERE username = '${username}';`;
//   const userData = await database.get(getUserQuery);
//   if (userData === undefined) {
//     response.status(400);
//     response.send("Invalid user");
//   } else {
//     if (await bcrypt.compare(password, userData.password)) {
//       const payload = { username: username };
//       const jwtToken = await jwt.sign(payload, "My_Secrete_Key");
//       response.send({ jwtToken: jwtToken });
//       console.log(jwtToken);
//     } else {
//       response.status(400);
//       response.send("Invalid password");
//     }
//   }
// });

// const authenticatingToken = (request, response, next) => {
//   let jwtToken;
//   const authHeader = request.headers["authorization"];
//   if (authHeader !== undefined) {
//     jwtToken = authHeader.split(" ")[1];
//   }
//   if (jwtToken === undefined) {
//     response.status(401);
//     response.send("Invalid JWT Token");
//   } else {
//     jwt.verify(jwtToken, "My_Secrete_Key", async (error, payload) => {
//       if (error) {
//         response.status(401);
//         response.send("Invalid JWT Token");
//       } else {
//         request.username = payload.username;
//         next();
//       }
//     });
//   }
// };

// app.get(
//   "/user/tweets/feed/",
//   authenticatingToken,
//   async (request, response) => {
//     const getUserTweetsQuery = `SELECT username,tweet,date_time AS dateTime
//                                 FROM user
//                                 INNER JOIN tweet ON user.user_id = tweet.user_id
//                                 INNER JOIN follower ON tweet.user_id = follower.following_user_id;`;
//     const tweetsArray = await database.all(getUserTweetsQuery);
//     response.send(tweetsArray);
//   }
// );

// app.get("/user/following/", authenticatingToken, async (request, response) => {
//   const getUserTweetsQuery = `SELECT name
//                                 FROM user
//                                 INNER JOIN follower ON user.user_id = follower.following_user_id;`;
//   const tweetsArray = await database.all(getUserTweetsQuery);
//   response.send(tweetsArray);
// });

// app.get("/user/followers/", authenticatingToken, async (request, response) => {
//   const getUserTweetsQuery = `SELECT name
//                                 FROM user
//                                 INNER JOIN follower ON user.user_id = follower.follower_user_id;`;
//   const tweetsArray = await database.all(getUserTweetsQuery);
//   response.send(tweetsArray);
// });

// app.get("/tweets/:tweetId/", authenticatingToken, async (request, response) => {
//   const { tweetId } = request.params;
//   const getUserQuery = `SELECT *
//                                 FROM user
//                                 WHERE username = '${request.username}';`;
//   const userData = await database.get(getUserQuery);
//   const userId = userData.user_id;
//   const getTweetsQuery = `SELECT tweet, COUNT(like.user_id) AS likes, COUNT(reply) AS replies, tweet.date_time AS dateTime
//                         FROM user
//                         INNER JOIN follower ON following_user_id = user.user_id
//                         INNER JOIN tweet ON tweet.user_id = following_user_id
//                         INNER JOIN reply ON tweet.user_id = reply.user_id
//                         INNER JOIN like ON like.user_id = reply.user_id
//                         WHERE tweet.tweet_id = ${tweetId}
//                         GROUP BY tweet.tweet_id;`;
//   const tweetsArray = await database.all(getTweetsQuery);

//   const tweetCheckQuery = `SELECT follower_user_id, following_user_id
//                             FROM follower
//                             INNER JOIN tweet ON tweet.user_id = following_user_id
//                             WHERE tweet.tweet_id = ${tweetId};`;
//   const followersData = await database.all(tweetCheckQuery);
//   if (
//     followersData.some((eachTweet) => eachTweet["follower_user_id"] === userId)
//   ) {
//     response.send(tweetsArray);
//   } else {
//     response.status(401);
//     response.send("Invalid Request");
//   }
// });

// const objectToArray = (dbObject) => {
//   let namesArray = [];
//   dbObject.map((eachName) => namesArray.push(eachName["username"]));
//   return namesArray;
// };

// app.get(
//   "/tweets/:tweetId/likes/",
//   authenticatingToken,
//   async (request, response) => {
//     const { tweetId } = request.params;
//     const getUserQuery = `SELECT *
//                                 FROM user
//                                 WHERE username = '${request.username}';`;
//     const userData = await database.get(getUserQuery);
//     const userId = userData.user_id;
//     const getLikesQuery = `SELECT  username
//                         FROM user
//                         INNER JOIN follower ON following_user_id = user.user_id
//                         INNER JOIN tweet ON tweet.user_id = following_user_id
//                         INNER JOIN reply ON tweet.user_id = reply.user_id
//                         INNER JOIN like ON like.user_id = reply.user_id
//                         WHERE tweet.tweet_id = ${tweetId} AND like.user_id = user.user_id
//                         GROUP BY tweet.tweet_id
//                         ;`;
//     const likesArray = await database.all(getLikesQuery);

//     const tweetCheckQuery = `SELECT follower_user_id, following_user_id
//                             FROM follower
//                             INNER JOIN tweet ON tweet.user_id = following_user_id
//                             WHERE tweet.tweet_id = ${tweetId};`;
//     const followersData = await database.all(tweetCheckQuery);
//     if (
//       followersData.some(
//         (eachTweet) => eachTweet["follower_user_id"] === userId
//       )
//     ) {
//       response.send({ likes: objectToArray(likesArray) });
//     } else {
//       response.status(401);
//       response.send("Invalid Request");
//     }
//   }
// );

// app.get(
//   "/tweets/:tweetId/replies/",
//   authenticatingToken,
//   async (request, response) => {
//     const { tweetId } = request.params;
//     const getUserQuery = `SELECT *
//                                 FROM user
//                                 WHERE username = '${request.username}';`;
//     const userData = await database.get(getUserQuery);
//     const userId = userData.user_id;
//     const getRepliesQuery = `SELECT  name,reply
//                         FROM user
//                         INNER JOIN follower ON following_user_id = user.user_id
//                         INNER JOIN tweet ON tweet.user_id = following_user_id
//                         INNER JOIN reply ON tweet.tweet_id = reply.tweet_id
//                         WHERE tweet.tweet_id = ${tweetId}
//                         GROUP BY tweet.tweet_id
//                         ;`;
//     const repliesArray = await database.all(getRepliesQuery);

//     const tweetCheckQuery = `SELECT follower_user_id, following_user_id
//                             FROM follower
//                             INNER JOIN tweet ON tweet.user_id = following_user_id
//                             WHERE tweet.tweet_id = ${tweetId};`;
//     const followersData = await database.all(tweetCheckQuery);
//     if (
//       followersData.some(
//         (eachTweet) => eachTweet["follower_user_id"] === userId
//       )
//     ) {
//       response.send({ replies: repliesArray });
//     } else {
//       response.status(401);
//       response.send("Invalid Request");
//     }
//   }
// );

// app.get("/user/tweets/", authenticatingToken, async (request, response) => {
//   const getTweetsQuery = `SELECT tweet, COUNT(like_id) AS likes, COUNT(reply_id) AS replies, tweet.date_time AS dateTime
//                         FROM user
//                         INNER JOIN tweet ON tweet.user_id = user.user_id
//                         INNER JOIN reply ON tweet.tweet_id = reply.tweet_id
//                         INNER JOIN like ON like.tweet_id = reply.tweet_id
//                         GROUP BY tweet.tweet_id;`;
//   const tweetsArray = await database.all(getTweetsQuery);
//   response.send(tweetsArray);
// });

// app.post("/user/tweets/", authenticatingToken, async (request, response) => {
//   const { tweet } = request.body;
//   const getUserQuery = `SELECT *
//                                 FROM user
//                                 WHERE username = '${request.username}';`;
//   const userData = await database.get(getUserQuery);
//   const userId = userData.user_id;
//   const date = format(new Date(), "yyyy-MM-dd H:m:s");
//   const insertTweetQuery = `INSERT INTO tweet
//                                 (tweet,user_id,date_time) VALUES ('${tweet}',${userId},'${date}');`;
//   await database.run(insertTweetQuery);
//   response.send("Created a Tweet");
// });

// app.delete(
//   "/tweets/:tweetId/",
//   authenticatingToken,
//   async (request, response) => {
//     const { tweetId } = request.params;
//     const getUserQuery = `SELECT *
//                                 FROM user
//                                 WHERE username = '${request.username}';`;
//     const userData = await database.get(getUserQuery);
//     const userId = userData.user_id;
//     const getTweetQuery = `SELECT *
//                             FROM tweet
//                             WHERE tweet_id = ${tweetId};`;
//     const tweet = await database.get(getTweetQuery);
//     if (tweet.user_id === userId) {
//       const deleteTweetQuery = `DELETE FROM tweet
//                                     WHERE tweet_id = ${tweetId};`;
//       await database.run(deleteTweetQuery);
//       response.send("Tweet Removed");
//     } else {
//       response.status(401);
//       response.send("Invalid Request");
//     }
//   }
// );

// module.exports = app;

// const express = require("express");
// const { open } = require("sqlite");
// const path = require("path");
// const sqlite3 = require("sqlite3");
// const bcrypt = require("bcrypt");
// const jwt = require("jsonwebtoken");
// //const format = require("date-fns/format");
// let database;
// const app = express();
// app.use(express.json());

// const initializeDBandServer = async () => {
//   try {
//     database = await open({
//       filename: path.join(__dirname, "twitterClone.db"),
//       driver: sqlite3.Database,
//     });
//     app.listen(3000, () => {
//       console.log("Server is running on http://localhost:3000/");
//     });
//   } catch (error) {
//     console.log(`Database error is ${error.message}`);
//     process.exit(1);
//   }
// };

// initializeDBandServer();

// //api 1

// app.post("/register/", async (request, response) => {
//   const { username, password, name, gender } = request.body;
//   const checkUser = `select username from user where username='${username}';`;
//   const dbUser = await database.get(checkUser);
//   console.log(dbUser);
//   if (dbUser !== undefined) {
//     response.status(400);
//     response.send("User already exists");
//   } else {
//     if (password.length < 6) {
//       response.status(400);
//       response.send("Password is too short");
//     } else {
//       const hashedPassword = await bcrypt.hash(password, 10);
//       const requestQuery = `insert into user(name, username, password, gender) values(
//           '${name}','${username}','${hashedPassword}','${gender}');`;
//       await database.run(requestQuery);
//       response.status(200);
//       response.send("User created successfully");
//     }
//   }
// });

// //api2
// app.post("/login/", async (request, response) => {
//   const { username, password } = request.body;
//   const checkUser = `select * from user where username='${username}';`;
//   const dbUserExist = await database.get(checkUser);
//   if (dbUserExist !== undefined) {
//     const checkPassword = await bcrypt.compare(password, dbUserExist.password);
//     if (checkPassword === true) {
//       const payload = { username: username };
//       const jwtToken = jwt.sign(payload, "secret_key");
//       response.send({ jwtToken });
//     } else {
//       response.status(400);
//       response.send("Invalid password");
//     }
//   } else {
//     response.status(400);
//     response.send("Invalid user");
//   }
// });

// //authentication jwt token

// const authenticationToken = (request, response, next) => {
//   let jwtToken;
//   const authHeader = request.headers["authorization"];
//   if (authHeader !== undefined) {
//     jwtToken = authHeader.split(" ")[1];
//   } else {
//     response.status(401);
//     response.send("Invalid JWT Token");
//   }

//   if (jwtToken !== undefined) {
//     jwt.verify(jwtToken, "secret_key", async (error, payload) => {
//       if (error) {
//         response.status(401);
//         response.send("Invalid JWT Token");
//       } else {
//         request.username = payload.username;
//         next();
//       }
//     });
//   }
// };

// //api 3

// app.get(
//   "/user/tweets/feed/",
//   authenticationToken,
//   async (request, response) => {
//     /** get user id from username  */
//     let { username } = request;
//     const getUserIdQuery = `select user_id from user where username='${username}';`;
//     const getUserId = await database.get(getUserIdQuery);
//     //console.log(getUserId);
//     /** get followers ids from user id  */
//     const getFollowerIdsQuery = `select following_user_id from follower
//     where follower_user_id=${getUserId.user_id};`;
//     const getFollowerIds = await database.all(getFollowerIdsQuery);
//     // console.log(getFollowerIds);
//     //get follower ids array
//     const getFollowerIdsSimple = getFollowerIds.map((eachUser) => {
//       return eachUser.following_user_id;
//     });
//     // console.log(getUserIds);
//     // console.log(`${getUserIds}`);
//     //query
//     const getTweetQuery = `select user.username, tweet.tweet, tweet.date_time as dateTime
//       from user inner join tweet
//       on user.user_id= tweet.user_id where user.user_id in (${getFollowerIdsSimple})
//        order by tweet.date_time desc limit 4 ;`;
//     const responseResult = await database.all(getTweetQuery);
//     //console.log(responseResult);
//     response.send(responseResult);
//   }
// );

// //api4

// app.get("/user/following/", authenticationToken, async (request, response) => {
//   let { username } = request;
//   const getUserIdQuery = `select user_id from user where username='${username}';`;
//   const getUserId = await database.get(getUserIdQuery);
//   // console.log(getUserId);
//   const getFollowerIdsQuery = `select following_user_id from follower
//     where follower_user_id=${getUserId.user_id};`;
//   const getFollowerIdsArray = await database.all(getFollowerIdsQuery);
//   //console.log(getFollowerIdsArray);
//   const getFollowerIds = getFollowerIdsArray.map((eachUser) => {
//     return eachUser.following_user_id;
//   });
//   //console.log(`${getFollowerIds}`);
//   const getFollowersResultQuery = `select name from user where user_id in (${getFollowerIds});`;
//   const responseResult = await database.all(getFollowersResultQuery);
//   //console.log(responseResult);
//   response.send(responseResult);
// });

// //api5

// app.get("/user/followers/", authenticationToken, async (request, response) => {
//   let { username } = request;
//   const getUserIdQuery = `select user_id from user where username='${username}';`;
//   const getUserId = await database.get(getUserIdQuery);
//   //console.log(getUserId);
//   const getFollowerIdsQuery = `select follower_user_id from follower where following_user_id=${getUserId.user_id};`;
//   const getFollowerIdsArray = await database.all(getFollowerIdsQuery);
//   console.log(getFollowerIdsArray);
//   const getFollowerIds = getFollowerIdsArray.map((eachUser) => {
//     return eachUser.follower_user_id;
//   });
//   console.log(`${getFollowerIds}`);
//   //get tweet id of user following x made
//   const getFollowersNameQuery = `select name from user where user_id in (${getFollowerIds});`;
//   const getFollowersName = await database.all(getFollowersNameQuery);
//   //console.log(getFollowersName);
//   response.send(getFollowersName);
// });

// //api 6
// const api6Output = (tweetData, likesCount, replyCount) => {
//   return {
//     tweet: tweetData.tweet,
//     likes: likesCount.likes,
//     replies: replyCount.replies,
//     dateTime: tweetData.date_time,
//   };
// };

// app.get("/tweets/:tweetId/", authenticationToken, async (request, response) => {
//   const { tweetId } = request.params;
//   //console.log(tweetId);
//   let { username } = request;
//   const getUserIdQuery = `select user_id from user where username='${username}';`;
//   const getUserId = await database.get(getUserIdQuery);
//   // console.log(getUserId);
//   //get the ids of whom the use is following
//   const getFollowingIdsQuery = `select following_user_id from follower where follower_user_id=${getUserId.user_id};`;
//   const getFollowingIdsArray = await database.all(getFollowingIdsQuery);
//   //console.log(getFollowingIdsArray);
//   const getFollowingIds = getFollowingIdsArray.map((eachFollower) => {
//     return eachFollower.following_user_id;
//   });
//   //console.log(getFollowingIds);
//   //get the tweets made by the users he is following
//   const getTweetIdsQuery = `select tweet_id from tweet where user_id in (${getFollowingIds});`;
//   const getTweetIdsArray = await database.all(getTweetIdsQuery);
//   const followingTweetIds = getTweetIdsArray.map((eachId) => {
//     return eachId.tweet_id;
//   });
//   // console.log(followingTweetIds);
//   //console.log(followingTweetIds.includes(parseInt(tweetId)));
//   if (followingTweetIds.includes(parseInt(tweetId))) {
//     const likes_count_query = `select count(user_id) as likes from like where tweet_id=${tweetId};`;
//     const likes_count = await database.get(likes_count_query);
//     //console.log(likes_count);
//     const reply_count_query = `select count(user_id) as replies from reply where tweet_id=${tweetId};`;
//     const reply_count = await database.get(reply_count_query);
//     // console.log(reply_count);
//     const tweet_tweetDateQuery = `select tweet, date_time from tweet where tweet_id=${tweetId};`;
//     const tweet_tweetDate = await database.get(tweet_tweetDateQuery);
//     //console.log(tweet_tweetDate);
//     response.send(api6Output(tweet_tweetDate, likes_count, reply_count));
//   } else {
//     response.status(401);
//     response.send("Invalid Request");
//     console.log("Invalid Request");
//   }
// });

// //api 7
// const convertLikedUserNameDBObjectToResponseObject = (dbObject) => {
//   return {
//     likes: dbObject,
//   };
// };
// app.get(
//   "/tweets/:tweetId/likes/",
//   authenticationToken,
//   async (request, response) => {
//     const { tweetId } = request.params;
//     //console.log(tweetId);
//     let { username } = request;
//     const getUserIdQuery = `select user_id from user where username='${username}';`;
//     const getUserId = await database.get(getUserIdQuery);
//     //console.log(getUserId);
//     //get the ids of whom thw use is following
//     const getFollowingIdsQuery = `select following_user_id from follower where follower_user_id=${getUserId.user_id};`;
//     const getFollowingIdsArray = await database.all(getFollowingIdsQuery);
//     //console.log(getFollowingIdsArray);
//     const getFollowingIds = getFollowingIdsArray.map((eachFollower) => {
//       return eachFollower.following_user_id;
//     });
//     //console.log(getFollowingIds);
//     //check is the tweet ( using tweet id) made by his followers
//     const getTweetIdsQuery = `select tweet_id from tweet where user_id in (${getFollowingIds});`;
//     const getTweetIdsArray = await database.all(getTweetIdsQuery);
//     const getTweetIds = getTweetIdsArray.map((eachTweet) => {
//       return eachTweet.tweet_id;
//     });
//     //console.log(getTweetIds);
//     //console.log(getTweetIds.includes(parseInt(tweetId)));
//     if (getTweetIds.includes(parseInt(tweetId))) {
//       const getLikedUsersNameQuery = `select user.username as likes from user inner join like
//        on user.user_id=like.user_id where like.tweet_id=${tweetId};`;
//       const getLikedUserNamesArray = await database.all(getLikedUsersNameQuery);
//       //console.log(getLikedUserNamesArray);
//       const getLikedUserNames = getLikedUserNamesArray.map((eachUser) => {
//         return eachUser.likes;
//       });
//       // console.log(getLikedUserNames);
//       /*console.log(
//         convertLikedUserNameDBObjectToResponseObject(getLikedUserNames)
//       );*/
//       response.send(
//         convertLikedUserNameDBObjectToResponseObject(getLikedUserNames)
//       );
//     } else {
//       response.status(401);
//       response.send("Invalid Request");
//     }
//   }
// );

// //api 8
// const convertUserNameReplyedDBObjectToResponseObject = (dbObject) => {
//   return {
//     replies: dbObject,
//   };
// };
// app.get(
//   "/tweets/:tweetId/replies/",
//   authenticationToken,
//   async (request, response) => {
//     //tweet id of which we need to get reply's
//     const { tweetId } = request.params;
//     console.log(tweetId);
//     //user id from user name
//     let { username } = request;
//     const getUserIdQuery = `select user_id from user where username='${username}';`;
//     const getUserId = await database.get(getUserIdQuery);
//     // console.log(getUserId);
//     //get the ids of whom the user is following
//     const getFollowingIdsQuery = `select following_user_id from follower where follower_user_id=${getUserId.user_id};`;
//     const getFollowingIdsArray = await database.all(getFollowingIdsQuery);
//     //console.log(getFollowingIdsArray);
//     const getFollowingIds = getFollowingIdsArray.map((eachFollower) => {
//       return eachFollower.following_user_id;
//     });
//     console.log(getFollowingIds);
//     //check if the tweet ( using tweet id) made by the person he is  following
//     const getTweetIdsQuery = `select tweet_id from tweet where user_id in (${getFollowingIds});`;
//     const getTweetIdsArray = await database.all(getTweetIdsQuery);
//     const getTweetIds = getTweetIdsArray.map((eachTweet) => {
//       return eachTweet.tweet_id;
//     });
//     console.log(getTweetIds);
//     //console.log(getTweetIds.includes(parseInt(tweetId)));
//     if (getTweetIds.includes(parseInt(tweetId))) {
//       //get reply's
//       //const getTweetQuery = `select tweet from tweet where tweet_id=${tweetId};`;
//       //const getTweet = await database.get(getTweetQuery);
//       //console.log(getTweet);
//       const getUsernameReplyTweetsQuery = `select user.name, reply.reply from user inner join reply on user.user_id=reply.user_id
//       where reply.tweet_id=${tweetId};`;
//       const getUsernameReplyTweets = await database.all(
//         getUsernameReplyTweetsQuery
//       );
//       //console.log(getUsernameReplyTweets);
//       /* console.log(
//         convertUserNameReplyedDBObjectToResponseObject(getUsernameReplyTweets)
//       );*/

//       response.send(
//         convertUserNameReplyedDBObjectToResponseObject(getUsernameReplyTweets)
//       );
//     } else {
//       response.status(401);
//       response.send("Invalid Request");
//     }
//   }
// );

// //api9
// app.get("/user/tweets/", authenticationToken, async (request, response) => {
//   let { username } = request;
//   const getUserIdQuery = `select user_id from user where username='${username}';`;
//   const getUserId = await database.get(getUserIdQuery);
//   console.log(getUserId);
//   //get tweets made by user
//   const getTweetIdsQuery = `select tweet_id from tweet where user_id=${getUserId.user_id};`;
//   const getTweetIdsArray = await database.all(getTweetIdsQuery);
//   const getTweetIds = getTweetIdsArray.map((eachId) => {
//     return parseInt(eachId.tweet_id);
//   });
//   console.log(getTweetIds);
// });

// //api 10

// app.post("/user/tweets/", authenticationToken, async (request, response) => {
//   let { username } = request;
//   const getUserIdQuery = `select user_id from user where username='${username}';`;
//   const getUserId = await database.get(getUserIdQuery);
//   //console.log(getUserId.user_id);
//   const { tweet } = request.body;
//   //console.log(tweet);
//   //const currentDate = format(new Date(), "yyyy-MM-dd HH-mm-ss");
//   const currentDate = new Date();
//   console.log(currentDate.toISOString().replace("T", " "));

//   const postRequestQuery = `insert into tweet(tweet, user_id, date_time) values ("${tweet}", ${getUserId.user_id}, '${currentDate}');`;

//   const responseResult = await database.run(postRequestQuery);
//   const tweet_id = responseResult.lastID;
//   response.send("Created a Tweet");
// });

// /*
// //to check if the tweet got updated
// app.get("/tweets/", authenticationToken, async (request, response) => {
//   const requestQuery = `select * from tweet;`;
//   const responseResult = await database.all(requestQuery);
//   response.send(responseResult);
// });*/

// //deleting the tweet

// //api 11
// app.delete(
//   "/tweets/:tweetId/",
//   authenticationToken,
//   async (request, response) => {
//     const { tweetId } = request.params;
//     //console.log(tweetId);
//     let { username } = request;
//     const getUserIdQuery = `select user_id from user where username='${username}';`;
//     const getUserId = await database.get(getUserIdQuery);
//     //console.log(getUserId.user_id);
//     //tweets made by the user
//     const getUserTweetsListQuery = `select tweet_id from tweet where user_id=${getUserId.user_id};`;
//     const getUserTweetsListArray = await database.all(getUserTweetsListQuery);
//     const getUserTweetsList = getUserTweetsListArray.map((eachTweetId) => {
//       return eachTweetId.tweet_id;
//     });
//     console.log(getUserTweetsList);
//     if (getUserTweetsList.includes(parseInt(tweetId))) {
//       const deleteTweetQuery = `delete from tweet where tweet_id=${tweetId};`;
//       await database.run(deleteTweetQuery);
//       response.send("Tweet Removed");
//     } else {
//       response.status(401);
//       response.send("Invalid Request");
//     }
//   }
// );

// module.exports = app;
