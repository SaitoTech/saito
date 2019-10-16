const saito = require('../../lib/saito/saito');
const h2m = require('h2m');
const sqlite = require('sqlite');
const ModTemplate = require('../../lib/templates/template');
const fs   = require('fs');
const util = require('util');
const URL  = require('url-parse');
const path = require('path');
const markdown = require( "markdown" ).markdown;
const { exec } = require('child_process');
const linkifyHtml = require('linkifyjs/html');

const request = require('request');
const ImageResolver = require('image-resolver');
const Jimp = require('jimp');


//////////////////
// CONSTRUCTOR  //
//////////////////
function Reddit(app) {

  if (!(this instanceof Reddit)) { return new Reddit(app); }

  Reddit.super_.call(this);

  this.app               = app;
  this.db                = null;
  this.dir               = path.join(__dirname, "../../data/reddit.sq3");

  this.name              = "Reddit";

  this.reddit            = {};
  this.reddit.posts_per_page = 30;
  this.reddit.firehose   = 1;   // 1 = show me everything
                                // 0 = only friends
  this.reddit.filter     = 0;   // 0 = show all comments
                                // 1 = only comments from ppl I follow

  this.reddit.username_timer = null;

  this.snapshot_dir      = __dirname + "/web/screenshots/";


  this.cacheEnabled      = 1;
  this.cacheEnabledPost  = 1; // cache post pages
  this.lastCached        = 0;
  this.lastID            = 1;

  // subreddit -- HTML loaded variable for /r/subreddit
  // load_content_on_load -- fetch posts from server on load?

  return this;

}
module.exports = Reddit;
util.inherits(Reddit, ModTemplate);



////////////////////
// Install Module //
////////////////////
Reddit.prototype.installModule = async function installModule() {

  if (this.app.BROWSER == 1) { return; }

  try {
    this.db = await sqlite.open(this.dir);

    let posts = this.db.run(
      `CREATE TABLE IF NOT EXISTS posts (
        id INTEGER,
        votes INTEGER,
        rank INTEGER,
        comments INTEGER,
        tx TEXT,
        post_id TEXT,
        reported INTEGER,
        approved INTEGER,
        url TEXT,
        domain TEXT,
        subreddit TEXT,
        unixtime INTEGER,
        unixtime_rank INTEGER,
        UNIQUE (tx),
        PRIMARY KEY(id ASC)
      )`, {});

    let comments = this.db.run(
      `CREATE TABLE IF NOT EXISTS comments (
        id INTEGER,
        votes INTEGER,
        post_id TEXT,
        comment_id TEXT,
        parent_id TEXT,
        reported INTEGER,
        approved INTEGER,
        tx TEXT,
        unixtime INTEGER,
        UNIQUE (tx),
        PRIMARY KEY(id ASC)
      )`, {});

    let votes = this.db.run(
      `CREATE TABLE IF NOT EXISTS votes (
        id INTEGER,
        docid TEXT,
        publickey TEXT,
        UNIQUE (publickey, docid),
        PRIMARY KEY(id ASC)
      )`, {});

    await Promise.all([posts, comments, votes]);
  } catch (err) {
    console.log(err);
  }
}



Reddit.prototype.updateFilter = function updateFilter(nf) {
  this.reddit.filter = nf;
  this.saveReddit();
}

Reddit.prototype.updateFirehose = function updateFirehose(nf) {
  this.reddit.firehose = nf;
  this.saveReddit();
}







////////////////
// Initialize //
////////////////
Reddit.prototype.initialize = async function initialize() {

  if (this.app.BROWSER == 0) { this.db = await sqlite.open(this.dir); return;}

  if (this.browser_active == 0) { return; }

  if (this.app.BROWSER == 1) {
    // transactions will be sent to this publickey
    this.publickey = this.app.network.peers[0].peer.publickey;

    if (load_content_on_load == 0) {
      $('#loading_posts').hide();
      return;
    }
    if (offset == null) { offset = 0; }


    ////////////////
    // SUBREDDITS //
    ////////////////
    if (post_id == "") {
      if (this.reddit.firehose == 1) {
        var rdloadtimer = setTimeout(() => {
          message                 = {};
          message.request         = "reddit load request";
          message.data            = {};
          message.data.request    = "reddit load request";
          message.data.subreddit  = subreddit;
          message.data.post_id    = post_id;
          message.data.comment_id = comment_id;
          message.data.offset     = offset;
          this.app.network.sendRequest(message.request, message.data);
        }, 500);
      }
    }


    //////////////////////
    // POSTS & COMMENTS //
    //////////////////////
    if (post_id != "") {

      if (post_id == "moderate") {
        var rdloadtimer = setTimeout(() => {
          message                 = {};
          message.request         = "reddit load moderate";
          message.data            = {};
          message.data.request    = "reddit load moderate";
          message.data.subreddit  = subreddit;
          message.data.post_id    = post_id;
          message.data.comment_id = comment_id;
          this.app.network.sendRequest(message.request, message.data);
        }, 500);
      }

      var rdloadtimer = setTimeout(() => {
        message                   = {};
        message.request           = "reddit load post";
        message.data              = {};
        message.data.request      = "reddit load post";
        message.data.subreddit    = subreddit.toLowerCase();
        message.data.post_id      = post_id;
        message.data.comment_id   = comment_id;
        message.data.load_content = load_content_on_load;
        this.app.network.sendRequest(message.request, message.data);
      }, 500);
    }
  }

}



/////////////////////
// Initialize HTML //
/////////////////////
Reddit.prototype.initializeHTML = function initializeHTML(app) {

  if (app.BROWSER == 0) { return; }
  $('#last').hide(); $('#page').hide();
  if ($('.post').length < 30) { $('#next').hide(); }


  // update wallet balance
  this.updateBalance(app);

  const chat = app.modules.returnModule("Chat");
  chat.addPopUpChat();


  // update name
  if (app.wallet.returnIdentifier() != "") {
    $('#saitoname').text(app.wallet.returnIdentifier());
  } else {
    $('#saitoname').text(this.formatAuthor(app.wallet.returnPublicKey()));
  }


  var mykey = app.wallet.returnPublicKey();


  // timer to check names of users
  this.reddit.username_timer = setTimeout(function() {

    var keystocheck = [];
    var updateme = 0;
    var posteradd = "";
    
    try {
      posteradd = $('.post_author_address').attr("id");
    } catch (err) {}

    if (posteradd == app.wallet.returnPublicKey()) {
      $('.d_edit').show();
    }



    $('.content_link_editpost').each(function() {
      if ($(this).attr("id") == mykey) {;
        $(this).show();
      }
    });

    $('.comment_link_edit').each(function() {
      if ($(this).attr("id") == mykey) {;
        $(this).show();
      }
    });


    $('.post_author').each(function() {

      var author_address = $(this).text();
      var post_id = $(this).attr('id');
      post_id = post_id.substring(12);
      var visible_author_id = "#post_author_clickable_" + post_id;
      var visible_author = $(visible_author_id).text();


      if (visible_author.indexOf("...") > 0) {
        updateme = 1;
        for (m = 0; m < keystocheck.length; m++) {
          if (keystocheck[m] == author_address) { updateme = 0; m = keystocheck.length; }
        }
        if (updateme == 1) {
          keystocheck.push(author_address);
        }
      }

      for (var cfg = 0; cfg < keystocheck.length; cfg++) {

        thispublickey = keystocheck[cfg];

        // fetch the ID for this KEY and update if FOUND
        app.dns.fetchIdentifier(thispublickey, function(answer) {

          if (app.dns.isRecordValid(answer) == 0) {
            //console.log(answer);
            return;
          }

          dns_response = JSON.parse(answer);

          let myidentifier = dns_response.identifier;
          let mypublickey = dns_response.publickey;

          $('.post_author').each(function() {
            var publickey2  = $(this).text();
            var tmpid = $(this).attr('id');
            tmpid = "#post_author_clickable_" + tmpid.substring(12);
            if (publickey2 === mypublickey) {
              $(tmpid).text(myidentifier);
            }
          });
        });
      }
    });
  }, 1000);

}


/////////////////
// Clear Cache //
/////////////////
Reddit.prototype.clearCache = function clearCache(app) {

  let directory = __dirname + "/web/cache/";

  fs.readdir(directory, (err, files) => {
    if (err) { throw err; }
    for (const file of files) {
      if (file.indexOf(".txt") > 0) {} else {
        fs.unlink(path.join(directory, file), err => {
          if (err) throw err;
        });
      }
    }
  });

}


///////////////////
// Attach Events //
///////////////////
Reddit.prototype.attachEvents = function attachEvents(app) {

  var reddit_self = this;

  if (app.BROWSER == 0) { return; }

  $('#next').off();
  $('#next').on('click', function() {
    offset += reddit_self.reddit.posts_per_page;
    var thispage = (offset/reddit_self.reddit.posts_per_page)+1;
    $('#posts').empty();
    $('#page').html("page "+thispage);
    $('#page').show();
    $('#last').show();
    load_content_on_load = 1;
    reddit_self.initialize();
  });
  $('#last').off();
  $('#last').on('click', function() {
    offset -= reddit_self.reddit.posts_per_page;
    if (offset < 0) { offset = 0; }
    if (offset == 0) { $('#last').hide(); $('#page').hide(); }
    var thispage = (offset/reddit_self.reddit.posts_per_page)+1;
    $('#page').html("page "+thispage);
    $('#posts').empty();
    load_content_on_load = 1;
    reddit_self.initialize();
  });



  $('.post_author_clickable').off();
  $('.post_author_clickable').on('click', function() {

    var myid = $(this).attr('id');
    myid = myid.substring(22);
    var author_key_div = "#post_author_"+myid;
    var author_key = $(author_key_div).text();

    var blacklist_post = confirm("Do you want to blacklist this user?");
    if (blacklist_post) {
      alert("You will not see further posts or comments from this user");
      reddit_self.app.keys.addKey(author_key, "", 0, "blacklist");
    }
  });


  $('.comment_header_clickable').off();
  $('.comment_header_clickable').on('click', function() {

    var myid = $(this).attr('id');
    myid = myid.substring(15);

    var author_key_div = ".comment_author_"+myid;
    var author_key_id = $(author_key_div).attr('id');
    var author_key = author_key_id.substring(15);

    var blacklist_post = confirm("Do you want to blacklist this user?");
    if (blacklist_post) {
      alert("You will not see further posts pr comments from this user");
      reddit_self.app.keys.addKey(author_key, "", 0, "blacklist");
    }

  });



  $('.approve').off();
  $('.approve').on('click', function() {

    var myid = $(this).attr('id');
    myid = myid.substring(8);

    var message                 = {};
    message.request         = "reddit moderate approve";
    message.data            = {};
    message.data.request    = "reddit moderate approve";
    message.data.post_id    = myid;

    reddit_self.app.network.sendRequest(message.request, message.data);

    var mid  = "#moderate_"+myid;
    $(mid).remove();

    return;
  });


  $('.disapprove').off();
  $('.disapprove').on('click', function() {

    var myid = $(this).attr('id');
    myid = myid.substring(11);

    var message                 = {};
    message.request         = "reddit moderate delete";
    message.data            = {};
    message.data.request    = "reddit moderate delete";
    message.data.post_id    = myid;

    var mid  = "#moderate_"+myid;
    $(mid).remove();

    reddit_self.app.network.sendRequest(message.request, message.data);

    return;
  });



  $('.comment_link_edit').off();
  $('.comment_link_edit').on('click', function() {

    let comment_to_edit = h2m($(this).parent().parent().find(".comment_text").html());
    let commentobj      = $(this).parent().parent().find(".comment_text").first();
    let comment_id      = $(this).parent().parent().parent().attr("id");
    let post_id         = $(".post_author").attr("id");

    comment_id          = comment_id.substring(8);
    post_id             = post_id.substring(12);


    $('.edit_data').val(comment_to_edit);
    $('.edit_comment_id').val(comment_id);
    $('.edit_post_id').val(post_id);
    $('.edit_interface').show();

    $('.edit_submit').off();
    $('.edit_submit').on('click', function() {

      var msg = {};
      msg.module     = "Reddit";
      msg.type       = "edit_comment";
      msg.post_id    = $('.edit_post_id').val();
      msg.comment_id = $('.edit_comment_id').val();
      msg.data       = $('.edit_data').val();

      var amount = 0.0;
      var fee    = 2.0001;

      var newtx = app.wallet.createUnsignedTransactionWithDefaultFee(reddit_self.publickey, amount);
      if (newtx == null) { alert("Unable to send TX. Do you have enough Saito?"); return; }
      newtx.transaction.msg = msg;
      newtx = app.wallet.signTransaction(newtx);
      app.network.propagateTransactionWithCallback(newtx, function() {
        alert("your edit has been broadcast");
        commentobj.html("Comment Updating...");
        commentobj.css('background-color','yellow');
        $('.edit_interface').hide();
      });

    });
  });





  $('.d_edit').off();
  $('.d_edit').on('click', function() {

    let post_to_edit    = h2m($(".d_text").html());
    let post_id         = $(".post_author_clickable").attr("id").substring(22);

    $('.edit_data').val(post_to_edit);
    $('.edit_comment_id').val("");
    $('.edit_post_id').val(post_id);
    $('.edit_interface').show();

    $('.edit_submit').off();
    $('.edit_submit').on('click', function() {

      var msg = {};
      msg.module     = "Reddit";
      msg.type       = "edit_post";
      msg.post_id    = $('.edit_post_id').val();
      msg.data       = $('.edit_data').val();

      var amount = 0.0;
      var fee    = 2.0001;

      var newtx = app.wallet.createUnsignedTransactionWithDefaultFee(reddit_self.publickey, amount);
      if (newtx == null) { alert("Unable to send TX. Do you have enough Saito?"); return; }
      newtx.transaction.msg = msg;
      newtx = app.wallet.signTransaction(newtx);
      app.network.propagateTransactionWithCallback(newtx, function() {
        alert("your edit has been broadcast");
        $(".d_text").html("Post Updating...");
        $(".d_text").css('background-color','yellow');
        $('.edit_interface').hide();
      });

    });
  });







  $('.content_link_editpost').off();
  $('.content_link_editpost').on('click', function() {

    var myid = $(this).attr('id');
    myid = myid.substring(20);
    var author_key_div = "#post_author_"+myid;
    var author_key = $(author_key_div).text();

    $.fancybox({
      href            : '#lightbox_editpost',
      fitToView       : false,
      width           : '100%',
      height          : '400px',
      closeBtn        : true,
      autoSize        : false,
      closeClick      : false,
      openEffect      : 'none',
      closeEffect     : 'none',
      helpers: {
        overlay : {
          closeClick : false
        }
      },
      keys : {
        close : null
      },
      afterShow : function(){
      }
    });
  });





  // toggle submission
  $('#submit').off();




  $('.content_link_report').off();
  $('.content_link_report').on('click', function() {

    var myid = $(this).attr('id');
    myid = myid.substring(20);
    var author_key_div = "#post_author_"+myid;
    var author_key = $(author_key_div).text();

    $.fancybox({
      href            : '#lightbox_report',
      fitToView       : false,
      width           : '100%',
      height          : '400px',
      closeBtn        : true,
      autoSize        : false,
      closeClick      : false,
      openEffect      : 'none',
      closeEffect     : 'none',
      helpers: {
        overlay : {
          closeClick : false
        }
      },
      keys : {
        close : null
      },
      afterShow : function(){

        $('#report_post_button').off();
        $('#report_post_button').on('click', function() {

          alert("You have flagged this post for review: " + myid + " -- " + subreddit);
          message                 = {};
          message.request         = "reddit report";
          message.data            = {};
          message.data.request    = "reddit report";
          message.data.subreddit  = subreddit.toLowerCase();
          message.data.post_id    = myid;
          reddit_self.app.network.sendRequest(message.request, message.data);
          $.fancybox.close();

        });

        $('#blacklist_user_button').off();
        $('#blacklist_user_button').on('click', function() {
          alert("You will not see further posts or comments from this user: "+author_key);
          reddit_self.app.keys.addKey(author_key, "", 0, "blacklist");
          $.fancybox.close();
        });

      }
    });
  });





  // toggle submission
  $('#submit').off();
  $('#submit').on('click', function() {
    if (reddit_self.app.wallet.returnBalance() == 0) {
      let getTokens = confirm("You need Saito tokens to post. Click OK to visit our faucet");
      if (getTokens == 1) { location.href = "/faucet?saito_app=r"; }
      return;
    } else {
      $('#submit_title').val("");
      $('#submit_link').val("");
      $('#submit_text').val("");
      $('#submit_r').val("");
      $('.loading_posts').hide();
      $('.posts').toggle();
      $('.submit').toggle();
      $('.balance').css("right", "0.5em");
      $('#submit_post').css("display", "grid");
    }
  });


  // toggle submission
  $('#home').off();
  $('#home').on('click', function() {
    location.href = "/r";
    return;
  });

  $('.toggle-post-button').off();
  $('.toggle-post-button').on('click', () => {
    var text = $('#submit_text').val();
    let markdown_preview = markdown.toHTML(text);

    $('.toggle-preview-text').empty();
    $('.toggle-preview-text').append(markdown_preview);

    $('.submit_text').toggle();
    $('.toggle-preview-text').toggle();
  });


  $('.submit_exit').off();
  $('.submit_exit').on('click', function() {
    $('#submit_title').val("");
    $('#submit_link').val("");
    $('#submit_text').val("");
    $('#submit_r').val("");
    $('.posts').toggle();
    $('.submit').toggle();
    $('.balance').css("right", "5.5rem");
    $('#submit_post').css("display", "none");
  });


  // submit new post
  $('#submit_button').off();
  $('#submit_button').on('click', function() {

    // fetch data from tx
    var msg = {};
    msg.module  = "Reddit";
    msg.type      = "post";
    msg.title     = $('#submit_title').val();
    msg.link      = $('#submit_link').val();
    msg.text      = $('#submit_text').val();
    msg.subreddit = $('#submit_r').val();

    var regex=/^[0-9A-Za-z]+$/;

    // check OK
    if (regex.test(msg.subreddit)) {} else {
      if (msg.subreddit != "") {
        alert("Only alphanumeric characters permitted in sub-reddit name");
        return;
      } else {
        msg.subreddit = "main";
      }
    }


    if (msg.title == "") {
      alert("You cannot submit an empty post");
      return;
    }

    var amount = 0.0;
    var fee    = 2.0001;

    // send post across network
    var newtx = app.wallet.createUnsignedTransactionWithDefaultFee(reddit_self.publickey, amount);

    if (newtx == null) { alert("Unable to send TX"); return; }
    newtx.transaction.msg = msg;
    newtx = app.wallet.signTransaction(newtx);
    app.network.propagateTransactionWithCallback(newtx, function() {
      alert("your post has been broadcast");
      reddit_self.addPost(newtx, null, reddit_self.app, 1, 1);
      $('#submit_post').toggle();
      $('.submit').toggle();
      $('.balance').css("right", "5.5rem");
      $('#posts').toggle();
    });
  });




  // toggle comment form
  $('.comment_link_reply').off();
  $('.comment_link_reply').on('click', function() {
    var id = $(this).attr('id').substring(19);
    var togglediv = "#comment_reply_"+id;
    $(togglediv).toggle();
  });



  // submit new comment
  $('.comment_reply_submit').off();
  $('.comment_reply_submit').on('click', function() {

    var id = $(this).attr('id').substring(21);
    var ud = "#comment_reply_textarea_"+id;

    var post_author = $('.post_author').html();
    var post_url = window.location.href;

    // fetch data from tx
    var msg = {};
    msg.module      = "Reddit";
    msg.type        = "comment";
    msg.text        = $(ud).val();
    msg.post_id     = post_id;
    msg.parent_id   = id;
    msg.post_author = post_author;
    msg.link        = post_url;
    msg.subreddit   = subreddit.toLowerCase();
    msg.identifier  = app.wallet.returnIdentifier();

    var amount = 0.0;
    var fee    = 1.0000;

    // send post across network
    var newtx = app.wallet.createUnsignedTransaction(reddit_self.publickey, amount, fee);
    if (newtx == null) { alert("Unable to send TX"); return; }
    newtx.transaction.msg = msg;
    newtx = app.wallet.signTransaction(newtx);
    app.network.propagateTransactionWithCallback(newtx, function() {
      alert("your comment has been broadcast");
      reddit_self.addComment(newtx, null, reddit_self.app, 1, 1);
      var rd = "#comment_reply_"+id;
      $(rd).toggle();
      if (id == 0) { $('#comment_reply_textarea_0').val(""); }
    });

  });



  ////////////
  // voting //
  ////////////
  $('.upvote_wrapper').off();
  $('.upvote_wrapper').on('click', function() {
    var upid   = $(this).attr("id");
    var cid    = upid.split("_")[2];
    reddit_self.vote(1, cid);
  });



  $('.downvote_wrapper').off();
  $('.downvote_wrapper').on('click', function() {
    var downid = $(this).attr("id");
    var cid    = downid.split("_")[2];
    reddit_self.vote(-1, cid);
  });

}



Reddit.prototype.vote = function vote(vote, docid) {

  var post = "post"; // 1 for post

  var tmpd = "#comment_"+docid;
  if ($(tmpd).length > 0) { post = "comment"; }

  var vtdiv  = "#votes_total_"+docid;
  var vtdivn = $(vtdiv).html();
  $(vtdiv).html(parseInt($(vtdiv).text())+parseInt(vote));

  message                 = {};
  message.request         = "reddit vote";
  message.data            = {};
  message.data.request    = "reddit vote";
  message.data.vote       = vote;
  message.data.type       = post;
  message.data.id         = docid;
  this.app.network.sendRequest(message.request, message.data);

}





////////////////////
// Add Moderation //
////////////////////
Reddit.prototype.addModerate = function addModerate(tx, message, app, ctype) {

  if (app.BROWSER == 0) { return; }

  let {sig, msg} = tx.transaction;

  var toInsert = `
  <div style="clear:both;margin-bottom:25px;" id="moderate_${sig}">
  <pre style="padding-bottom:1rem;"><code>${JSON.stringify(msg, null, 4)}</code></pre>
  <div class="approve" id="approve_${sig}">permit post</div>
  <div class="disapprove" id="disapprove_${sig}">delete post</div>
  </div>`;

  $('#posts').append(toInsert);
  this.attachEvents(this.app);

}


//////////////
// Add Post //
//////////////
Reddit.prototype.addPost = function addPost(tx, message, app, prepend=0, pending=0) {

  if (app.BROWSER == 0) { return; }

  if (this.app.keys.isTagged(tx.transaction.from[0].add, "blacklist")) { return; }

  $('#loading_posts').hide();

  // for post & comment pages
  if (post_id != null && post_id != "") {
    var st = '<a href="'+message.url+'">'+tx.transaction.msg.title+'</a>';
    var ss = '('+message.domain+')';
    var th = '<img class="thumbnail_image" src="/r/screenshots/'+message.data.id+'.png" />';
    $('#d_post_author').text(tx.transaction.from[0].add);
    if (tx.transaction.msg.link == "") {
      $('#d_content_title').text(tx.transaction.msg.title);
    } else {
      $('#d_content_title').html(`<a target="_blank" href="${tx.transaction.msg.link}">${tx.transaction.msg.title}</a>`);
    }
    var content_subreddit = '/r/'+message.data.subreddit;
    var content_thumbnail = "/r/screenshots/"+message.data.id+".png";
    let updatethmb = '<img src="'+content_thumbnail+'" class="thumbnail_image" onerror="this.src=\'/img/saito-logo-blue.png\'" /></div>';
    $('#d_thumb').html(updatethmb);
    var cd = 'submitted by <span class="post_author_clickable" id="post_author_clickable_'+tx.transaction.sig+'">'+this.formatAuthor(tx.transaction.from[0].add)+'</span><span class="post_author_address" id="'+tx.transaction.from[0].add+'" style="display:none"></span>';
    if (message.data.subreddit != "") { cd += ' to <a href="'+content_subreddit+'">'+content_subreddit+'</a>'; }

    $('#d_content_details').html(cd);
    $('#d_text').html(linkifyHtml(markdown.toHTML(tx.transaction.msg.text)));

    if (message != null) {
      $('#d_votes > .votes > .votes_total').text(message.data.votes);
      var dv = "downvote_wrapper_"+tx.transaction.sig;
      var uv = "upvote_wrapper_"+tx.transaction.sig;
      var vt = "votes_total_"+tx.transaction.sig;
      var pa = "post_author_"+post_id;;
      $('#d_votes > .votes > .upvote_wrapper').attr('id', uv);
      $('#d_votes > .votes > .downvote_wrapper').attr('id', dv);
      $('#d_votes > .votes > .votes_total').attr('id', vt);
      $('#d > .post_author').attr('id', pa);
      $('#d > .post_author').text(tx.transaction.from[0].add);
    }
    this.attachEvents(this.app);

    //
    // enable editing link if we are this author
    //
    if (tx.transaction.from[0].add == app.wallet.returnPublicKey()) {
      $('.d_edit').show();
    }


    if ($('.post').length > 29) {
      $('#next').show();
    }
    if (offset > 0) { $('#last').show(); $('#page').show(); }

    return;
  }


  // fetch data from tx
  var msg = {};
  var content_title     = "Title Loading";
  var content_site      = "(i.imgur.com)";
  var content_details   = "";
  var content_thumbnail = "";
  var content_subreddit = "";
  var cpost_id          = "";
  var content_link      = "";
  var content_site_link = "";
  var comments_link     = "";
  var comments_text     = "read comments";
  var votes_total       = 1;
  var comment_thumbnail = "";

  if (tx != null) {

    // figure out what the URL is
    var myhref = tx.transaction.msg.link;
    if (myhref.indexOf("http://") != 0 && myhref.indexOf("https://") != 0) { myhref = "http://" + myhref; }
    var link   = new URL(myhref);

    content_title       = tx.transaction.msg.title;
    cpost_id            = tx.transaction.sig;
    content_subreddit   = '/r/'+tx.transaction.msg.subreddit;
    content_subreddit   = content_subreddit;
    if (content_subreddit == '/r/') {
      content_subreddit = "/r/main";
    }
    content_site        = content_subreddit;
    content_site_link   = "";
    content_details     = "submitted by <span class=\"post_author_clickable\" id=\"post_author_clickable_"+cpost_id+"\">"+this.formatAuthor(tx.transaction.from[0].add)+'</span> to <a href="'+content_subreddit+'">'+content_subreddit+'</a><span class="post_author_address" style="display:none" id="'+tx.transaction.from[0].add+'"></span>';
    content_link        = '/r/'+content_subreddit+'/'+cpost_id;
    comments_link       = '/r/'+content_subreddit+'/'+cpost_id;
    if (link.href != "") {
      content_link      = link.href;
    }
    if (link.hostname != "") {
      content_site      = link.hostname;
      content_site_link = "http://";
    }
    if (content_link === "http://") {
      content_link        = content_subreddit+'/'+cpost_id;
    }
    if (tx.transaction.msg.text != undefined) {
      if (tx.transaction.msg.text.length > 0) {
        content_link        = content_subreddit+'/'+cpost_id;
      }
    }

    comment_thumbnail  = "/img/saito-logo-blue.png";

    comments_text       = "read comments";
    if (message != null) {
      if (message.data.comments == 1) { comments_text = "1 comment"; }
      if (message.data.comments > 1)  { comments_text = message.data.comments + " comments"; }
      if (message.data.id > 0)        {
        comment_thumbnail  = "/r/screenshots/"+message.data.id+".png";
        this.lastID = message.data.id;
      }
      votes_total       = message.data.votes;
    }
  }


  // prevent double adds (if post already exists)
  tmp_post_id = "#post_"+cpost_id;
  if ($(tmp_post_id).length > 0) { return; }

  var toInsert = this.returnPostHtml(
      cpost_id,
      tx.transaction.from[0].add,
      votes_total,
      comment_thumbnail,
      content_link,
      content_title,
      content_site_link,
      content_site,
      content_subreddit,
      content_details,
      comments_text
  );

  if (prepend == 0) {
    $('#posts').append(toInsert);
  } else {
    $('#posts').prepend(toInsert);
  }

  // note pending posts / comments as pending
  if (pending == 1) {
    var post_div = "#post_"+tx.transaction.sig;
    $(post_div).css('background-color','yellow');
    var post_div2 = post_div + " > .content > .content_links";
    $(post_div2).html('<a href="" onclick="alert(\'Your post is awaiting confirmation by the Saito network. It should be added to our live site for others to see and comment on within 1-2 minutes of being confirmed.\');return false;">your post being processed by the network!</a>');
  }

  // we only re-order if we are not adding at the top
  if (pending == 0) {
    this.reorderPosts(cpost_id);
  }

  if ($('.post').length > 29) {
    $('#next').show();
  }

  this.attachEvents(this.app);


}


Reddit.prototype.returnPostHtml = function returnPostHtml(cpost_id, post_author_address, votes_total, comment_thumbnail, content_link, content_title, content_site_link, content_site, content_subreddit, content_details, comments_text) {

  //console.log("in returnPostHTML w/ comments: " + comments_text);

  var toInsert = `
      <div class="post" id="post_${cpost_id}">
        <div class="post_author" id="post_author_${cpost_id}">${post_author_address}</div>
        <div class="votes">
          <div class="upvote_wrapper" id="post_upvote_${cpost_id}"><i class="fa fa-arrow-up upvote post_upvote" aria-hidden="true"></i></div>
          <div class="votes_total" id="votes_total_${cpost_id}">${votes_total}</div>
          <div class="downvote_wrapper" id="post_downvote_${cpost_id}"><i class="fa fa-arrow-down downvote post_downvote" aria-hidden="true"></i></div>
        </div>
        <div class="thumbnail"><img src="${comment_thumbnail}" class="thumbnail_image" onerror="this.src='/img/saito-logo-blue.png'" /></div>
        <div class="content">
          <div class="content_title"><a href="${content_link}">${content_title}</a> <div class="content_site">(<a href="${content_site_link+content_site}'">${content_site}</a>)</div></div>
          <div class="content_details">${content_details}</div>
          <div class="content_links">
            <a href="${content_subreddit}/${cpost_id}" class="content_link content_link_comments">${comments_text}</a>
            <div class="content_link content_link_editpost" id="${post_author_address}">edit</div>
            <div class="content_link content_link_report" id="content_link_report_${cpost_id}">report</div>
          </div>
        </div>
      </div>
  `;
  return toInsert;
}

/////////////////
// Add Comment //
/////////////////
Reddit.prototype.addComment = function addComment(tx, message, app, prepend, pending=0) {

  if (app.BROWSER == 0) { return; }

  if (this.app.keys.isTagged(tx.transaction.from[0].add, "blacklist")) { return; }

  // fetch data from tx
  var msg = {};
  var content_text      = "Comment";
  var pid               = 0;
  var cid               = 0;
  var votes_total       = 1;
  var commentor_address = tx.transaction.from[0].add;

  if (tx != null) {
    content_text  = tx.transaction.msg.text;
    pid           = tx.transaction.msg.parent_id;
    cid           = tx.transaction.sig;
  }

  // prevent double adds (if post already exists)
  tmp_comment_id = "#comment_"+cid;
  if ($(tmp_comment_id).length > 0) { return; }



  if (message != null) {
    votes_total   = message.data.votes;
  }

  var toInsert = '\
      <div class="comment" id="comment_'+cid+'">\
        <div class="comment_upvotes" id="comment_upvotes_'+cid+'">\
<div class="upvote_wrapper" id="upvote_wrapper_'+cid+'"><i class="fa fa-arrow-up upvote comment_upvote" aria-hidden="true"></i></div>\
<div class="votes_total" id="votes_total_'+cid+'">'+votes_total+'</div>\
<div class="downvote_wrapper" id="upvote_wrapper_'+cid+'"><i class="fa fa-arrow-down downvote comment_downvote" aria-hidden="true"></i></div>\
        </div>\
        <div class="comment_body" id="comment_body_'+cid+'">\
          <div class="comment_header comment_header_clickable" id="comment_header_'+cid+'">'+this.formatAuthor(tx.transaction.from[0].add)+'</div>\
          <div class="comment_author_'+cid+'" id="comment_author_'+tx.transaction.from[0].add+'" style="display:none"></div>\
          <div class="comment_text" id="comment_text_'+cid+'">'+linkifyHtml(markdown.toHTML(content_text))+'</div>\
          <div class="comment_links" id="comment_links_'+cid+'">\
            <div class="comment_link comment_link_edit" id="'+commentor_address+'">edit</div>\
            <div class="comment_link comment_link_reply" id="comment_link_reply_'+cid+'">reply</div>\
          </div>\
          <div class="comment_reply" id="comment_reply_'+cid+'">\
<textarea class="comment_reply_textarea" id="comment_reply_textarea_'+cid+'"></textarea>\
<input type="button" class="comment_reply_submit" id="comment_reply_submit_'+cid+'" value="reply" />\
          </div>\
          <div class="comment_replies" id="comment_replies_'+cid+'">\
          </div>\
        </div>\
      </div>\
    </div>\
  ';

  // top-level comment
  var divtoadd = "#comments";
  if (pid != 0) { divtoadd = "#comment_replies_"+pid; }

  if (prepend == 0) {
    $(divtoadd).append(toInsert);
  } else {
    $(divtoadd).prepend(toInsert);
  }


  // fetch identifier (?)
  if (this.formatAuthor(tx.transaction.from[0].add).substring(0,10) == tx.transaction.from[0].add.substring(0,10)) {
    app.dns.fetchIdentifier(tx.transaction.from[0].add, function(answer) {

      if (app.dns.isRecordValid(answer) == 0) {
        //console.log(answer);
        return;
      }

      dns_response = JSON.parse(answer);
      var tmpselect = "#comment_header_" + cid;
      $(tmpselect).html(dns_response.identifier);

    });
  }




  // note pending posts / comments as pending
  if (pending == 1) {
    var comment_div = "#comment_"+tx.transaction.sig;
    $(comment_div).css('background-color','yellow');
    var comment_div2 = comment_div + " > .comment_body > .comment_links";
    $(comment_div2).html('<a href="" onclick="alert(\'Your comment is awaiting confirmation by the Saito network. It should be added to our live site for others to see and reply to within 1-2 minutes of being confirmed.\');return false;">your comment is being processed by the network!</a>');
  }



  this.reorderComments(cid);
  this.attachEvents(this.app);

}




///////////////////
// Reorder Posts //
///////////////////
Reddit.prototype.reorderPosts = function reorderPosts(cid) {

  var reddit_self = this;

  var aid = '#post_'+cid;
  var avt = '#votes_total_'+cid;

  var myobj    = $(aid);
  var myvotes  = $(avt).html();
  var parent   = $(aid).parent();
  var children = $(aid).parent().children();

  var changed  = 0;
  var reachedus = 0;

  children.each(function() {

    var bid    = '#post_' + $(this).attr('id').substring(5) ;
    var bvt    = '#votes_total_' + $(this).attr('id').substring(5) ;
    var bvotes = $(bvt).html();

    if (reachedus == 1) {

      if (parseInt(bvotes) > parseInt(myvotes)) {
        var div1 = $(myobj);
        var div2 = $(this);
        div1.detach();
        div1.insertAfter(div2);
        changed = 1;
        reddit_self.reorderComments(cid);
      }

    }
    if (bid === aid) { reachedus = 1; }

  });


}
//////////////////////
// Reorder Comments //
//////////////////////
Reddit.prototype.reorderComments = function reorderComments(cid) {

  var reddit_self = this;

  var aid = '#comment_'+cid;
  var avt = '#votes_total_'+cid;

  var myobj    = $(aid);
  var myvotes  = $(avt).html();
  var parent   = $(aid).parent();
  var children = $(aid).parent().children();

  var changed  = 0;
  var reachedus = 0;

  children.each(function() {

    var bid    = '#comment_' + $(this).attr('id').substring(8) ;
    var bvt    = '#votes_total_' + $(this).attr('id').substring(8) ;
    var bvotes = $(bvt).html();

    if (reachedus == 1) {

      if (parseInt(bvotes) > parseInt(myvotes)) {
        var div1 = $(myobj);
        var div2 = $(this);
        div1.detach();
        div1.insertAfter(div2);
        changed = 1;
        reddit_self.reorderComments(cid);
      }

    }
    if (bid === aid) { reachedus = 1; }

  });

}


/////////////////////////
// Handle Web Requests //
/////////////////////////
Reddit.prototype.webServer = function webServer(app, expressapp) {

  var reddit_self = this;

  expressapp.get('/r/mod', function (req, res) {
    res.sendFile(__dirname + '/web/mod.html');
    return;
  });
  expressapp.get('/r/style.css', function (req, res) {
    res.sendFile(__dirname + '/web/style.css');
    return;
  });

  expressapp.get('/r/about.html', function (req, res) {
    res.sendFile(__dirname + '/web/about.html');
    return;
  });
  expressapp.get('/r/screenshots/:thumbnail', function (req, res) {
    var thumbnail = '/web/screenshots/'+req.params.thumbnail;
    if (thumbnail.indexOf("\/") != false) { return; }
    res.sendFile(__dirname + thumbnail);
    return;
  });
  expressapp.get('/r/:subreddit', function (req, res) {
    var this_subreddit = req.params.subreddit;
    this_subreddit = this_subreddit.toLowerCase();
    var cachedFile = this_subreddit.replace(/\W/g, '') + ".html";
    var data = "";
    var offset = 0;

    var req2 = req;
    var res2 = res;

    if (req.query.offset > 0) { offset = req.query.offset; }

    if (offset == 0 && reddit_self.cacheEnabled == 1 && fs.existsSync(__dirname + '/web/cache/' + cachedFile)) {
      //var cachedSubRedditFile = __dirname + "/web/cache/" + cachedFile;
      //res.sendFile(cachedSubRedditFile);
      //return;
      //
      // no cacheing of subreddit pages yet
      //
      data = fs.readFileSync(__dirname + '/web/index.html', 'utf8', (err, data) => {});
      data = data.replace('subreddit = ""','subreddit = "'+this_subreddit+'"');
    } else {
      data = fs.readFileSync(__dirname + '/web/index.html', 'utf8', (err, data) => {});
      data = data.replace('subreddit = ""','subreddit = "'+this_subreddit+'"');
    }
    if (req.query.offset > 0) {
      data = data.replace('offset = 0','offset = '+req.query.offset);
    }
    res.setHeader('Content-type', 'text/html');
    res.charset = 'UTF-8';
    res.write(data);
    res.end();
    return;
  });
  expressapp.get('/r/:subreddit/:post_id', function (req, res) {
    var this_subreddit = req.params.subreddit;
    this_subreddit = this_subreddit.toLowerCase();
    var this_post_id   = req.params.post_id;
    var data = "";
    var cachedFile = this_post_id.replace(/\W/g, '') + ".html";
    if (reddit_self.cacheEnabledPost == 1 && fs.existsSync(__dirname + '/web/cache/' + cachedFile)) {
      data = fs.readFileSync(__dirname + '/web/cache/' + cachedFile, 'utf8', (err, data) => {});
      data = data.replace('subreddit = ""','subreddit = "'+this_subreddit+'"');
      data = data.replace('post_id = ""','post_id = "'+this_post_id+'"');
      data = data.replace('load_content_on_load = 1', 'load_content_on_load = 0');
    } else {
      data = fs.readFileSync(__dirname + '/web/post.html', 'utf8', (err, data) => {});
      data = data.replace('subreddit = ""','subreddit = "'+this_subreddit+'"');
      data = data.replace('post_id = ""','post_id = "'+this_post_id+'"');
    }
    res.setHeader('Content-type', 'text/html');
    res.charset = 'UTF-8';
    res.write(data);
    res.end();
    return;
  });
  expressapp.get('/r/:subreddit/:post_id/:comment_id', function (req, res) {
    var this_subreddit = req.params.subreddit;
    this_subreddit = this_subreddit.toLowerCase();
    var this_post_id   = req.params.post_id;
    var this_comment_id = req.params.comment_id;
    var data = fs.readFileSync(__dirname + '/web/post.html', 'utf8', (err, data) => {});
    data = data.replace('subreddit = ""','subreddit = "'+this_subreddit+'"');
    data = data.replace('post_id = ""','post_id = "'+this_post_id+'"');
    data = data.replace('comment_id = ""','comment_id = "'+this_comment_id+'"');
    res.setHeader('Content-type', 'text/html');
    res.charset = 'UTF-8';
    res.write(data);
    res.end();
    return;
  });
  expressapp.get('/r', function (req, res) {
    var offset = 0;
    if (req.query.offset > 0) { offset = req.query.offset; }
    if (reddit_self.cacheEnabled == 1 && fs.existsSync(__dirname + '/web/cache/main.html') && offset == 0) {
      res.sendFile(__dirname + '/web/cache/main.html');
      return;
    } else {
      if (offset == 0) {
        res.sendFile(__dirname + '/web/index.html');
        return;
      } else {
        var data = fs.readFileSync(__dirname + '/web/index.html', 'utf8', (err, data) => {});
        data = data.replace('offset = 0','offset = '+offset);
        res.setHeader('Content-type', 'text/html');
        res.charset = 'UTF-8';
        res.write(data);
        res.end();
        return;
      }
    }
  });

}




//////////////////////////
// Handle Peer Requests //
//////////////////////////
Reddit.prototype.handlePeerRequest = async function handlePeerRequest(app, msg, peer, mycallback) {

  var reddit_self = this;

    /////////////////////
    // server -- posts //
    /////////////////////
    if (msg.request === "reddit load request") {

      var sr = msg.data.subreddit.toLowerCase();
      var so = msg.data.offset;

      var sql    = "SELECT * FROM posts ORDER BY unixtime_rank DESC LIMIT $ppp OFFSET $offset";
      var params = { $ppp : this.reddit.posts_per_page , $offset : so };
      if (sr != "" && sr != null) {
        sql = "SELECT * FROM posts WHERE subreddit = $sr ORDER BY unixtime_rank DESC LIMIT $ppp OFFSET $offset";
        params = { $sr : sr ,$ppp : this.reddit.posts_per_page ,  $offset : so };
      }
      try {
        var rows = await this.db.all(sql, params);
      } catch(err) {
        console.log(err);
      }
      if (rows != null) {
        if (rows.length != 0) {
          for (var fat = 0; fat < rows.length; fat++) {
            message                 = {};
            message.request         = "reddit load";
            message.data            = {};
            message.data.id         = rows[fat].id;
            message.data.tx         = rows[fat].tx;
            message.data.subreddit  = "";
            if (rows[fat].subreddit != null) {
              message.data.subreddit  = rows[fat].subreddit;
            }
            message.data.post_id    = rows[fat].post_id;
            message.data.unixtime   = rows[fat].unixtime;
            message.data.comments   = rows[fat].comments;
            message.data.votes      = rows[fat].votes;
            peer.sendRequest(message.request, message.data);
          }
        }
      } else {
        peer.sendRequest("reddit load null", {});
      }
      return;
    }


    // loads list of posts
    if (msg.request === "reddit load all") {

      var sr = msg.data.subreddit.toLowerCase();
      var so = msg.data.offset;

      var sql    = "SELECT * FROM posts ORDER BY unixtime_rank DESC LIMIT $ppp OFFSET $offset";
      var params = { $ppp : this.reddit.posts_per_page , $offset : so };
      if (sr != "" && sr != null) {
        sql = "SELECT * FROM posts WHERE subreddit = $sr ORDER BY unixtime_rank DESC LIMIT $ppp OFFSET $offset";
        params = { $sr : sr ,$ppp : this.reddit.posts_per_page ,  $offset : so };
      }
      try {
        var rows = await this.db.all(sql, params);
      } catch(err) {
        console.log(err);
      }
      if (rows != null) {
        if (rows.length != 0) {
          let message                 = {};
              message.request         = "reddit payload";
              message.data            = [];

          for (var fat = 0; fat < rows.length; fat++) {

            let {id, tx, subreddit, post_id, unixtime, comments, votes} = rows[fat];
            tx = JSON.parse(tx)
            let {text, link, title} = tx.msg;

            message.data.push({
              id: id,
              tx: tx,
              title,
              link,
              text,
              subreddit: subreddit ? subreddit : "main",
              post_id: post_id,
              unixtime: unixtime,
              comments: comments,
              votes: votes,
            })
          }
          peer.sendRequest(message.request, message.data);
        }
      } else {
        peer.sendRequest("reddit load null", {});
      }
      return;
    }

    /////////////////////////////////////
    // server -- report TOS violations //
    /////////////////////////////////////
    if (msg.request === "reddit report") {
      var rp = msg.data.post_id;
      var sql    = "UPDATE posts SET reported = 1 WHERE post_id = $pid";
      var params = { $pid : rp };
      try {
        this.db.run(sql, params);
      } catch(err) {
        console.log(err);
      }
      return;
    }

    /////////////////////
    // server -- votes //
    /////////////////////
    if (msg.request === "reddit vote") {

      var vote  = msg.data.vote;
      var type  = msg.data.type;
      var docid = msg.data.id;
      var voter = peer.peer.publickey;

      var reddit_self = this;

      var sql = "SELECT count(*) AS count FROM votes WHERE docid = $dic AND publickey = $pkey";
      var params = { $dic : docid , $pkey : voter };
      try {
        var row = await this.db.all(sql, params);
      } catch(err) {
        console.log(err);
      }
      if (row != null) {
      if (row.count == 1) { return; }

      var sql2    = "INSERT OR IGNORE INTO votes (docid, publickey) VALUES ($docid, $pkey)";
      var params2 = { $docid : docid , $pkey : voter };
      try {
        this.db.run(sql2, params2);
      } catch(err) {
        console.log(err);
      }

      var sql3 = "";
      var params3 = { $pid : docid };

      if (type == "post") {

        // if we haven't voted yet, we are permitted to vote
        var current_time = new Date().getTime();
        var vote_bonus   = 1000000;

        sql3 = "UPDATE posts SET votes = votes + 1, unixtime_rank = cast((unixtime_rank + ($vote_bonus * (2000000/($current_time-unixtime)))) as INTEGER) WHERE post_id = $pid";
        params3 = { $pid : docid , $vote_bonus : vote_bonus , $current_time : current_time };

        if (vote == -1) {
          sql3 = "UPDATE posts SET votes = votes - 1, unixtime_rank = cast((unixtime_rank - ($vote_bonus * (2000000/($current_time-unixtime)))) as INTEGER) WHERE post_id = $pid";
          params3 = { $pid : docid , $vote_bonus : vote_bonus , $current_time : current_time };
        }
      } else {
        sql3 = "UPDATE comments SET votes = votes + 1 WHERE comment_id = $pid";
        if (vote == -1) {
          sql3 = "UPDATE comments SET votes = votes - 1 WHERE comment_id = $pid";
        }
      }
      try {
        this.db.all(sql3, params3);
      } catch(err) {
        console.log(err);
      }

      if (msg.data != null) {
        if (msg.data.subreddit != undefined) {
          reddit_self.generateCachedPagePosts(msg.data.subreddit.toLowerCase());
        }
      }
      reddit_self.generateCachedPagePosts("main");
      reddit_self.lastCached = new Date().getTime();

      }
      return;
    }



    ///////////////////////////////
    // server -- post + comments //
    ///////////////////////////////
    if (msg.request === "reddit load post") {

      var pid = msg.data.post_id;
      var cid = msg.data.comment_id;
      var lco = msg.data.load_content;

      var sql  = "SELECT * FROM posts WHERE post_id = $pid";
      try {
        var rows = await this.db.all(sql, { $pid : pid });
      } catch(err) {
        console.log(err);
      }
      if (rows != null) {
        for (var fat = rows.length-1; fat >= 0; fat--) {
          var message             = {};
          message.request         = "reddit post";
          message.data            = {};
          message.data.id         = rows[fat].id;
          message.data.tx         = rows[fat].tx;
          message.data.unixtime   = rows[fat].unixtime;
          message.data.votes      = rows[fat].votes;
          message.data.comments   = rows[fat].comments;
          message.data.subreddit  = "";
          if (rows[fat].subreddit != null) {
            message.data.subreddit  = rows[fat].subreddit;
          }
          if (lco == 1) {
            peer.sendRequest(message.request, message.data);
          }

          var sql2 = "SELECT * FROM comments WHERE post_id = $pid ORDER BY unixtime ASC";
          try {
            var rows2 = await this.db.all(sql2, { $pid : pid });
          } catch(err) {
            console.log(err);
          }
          if (rows2 != null) {
            for (var fat2 = 0; fat2 <= rows2.length-1; fat2++) {
              var message2             = {};
              message2.request         = "reddit comment";
              message2.data            = {};
              message2.data.id         = rows2[fat2].id;
              message2.data.tx         = rows2[fat2].tx;
              message2.data.unixtime   = rows2[fat2].unixtime;
              message2.data.votes      = rows2[fat2].votes;
              peer.sendRequest(message2.request, message2.data);
            }
          }
        }
      } else {
        var message             = {};
        message.request         = "reddit post null";
        message.data            = {};
        message.data.msg        = "There don't seem to be any posts. Be the first to post!"
        peer.sendRequest(message.request, message.data);
      }
      return;
    }



    if (msg.request === "reddit load comments") {

      var pid = msg.data.post_id;

      var sql = "SELECT * FROM comments WHERE post_id = $pid ORDER BY unixtime ASC";
      try {
        var rows = await this.db.all(sql, { $pid : pid });
      } catch(err) {
        console.log(err);
      }
      if (rows != null) {
        var message             = {};
        message.request         = "reddit comments";
        message.data            = [];
        for (var fat = 0; fat <= rows.length-1; fat++) {
          let {id, tx, unixtime, votes} = rows[fat];
          tx = JSON.parse(tx)
          let {identifier, post_id, parent_id, subreddit, text} = tx.msg;

          let comment = {
            id: id,
            text: text,
            author: identifier,
            publickey: tx.from[0].add,
            votes: votes,
            unixtime: unixtime,
            post_id: post_id,
            parent_id: parent_id.toString(),
            subreddit: subreddit,
            sig: tx.sig,
            tx
          }

          if (comment.parent_id === '0') {
            message.data = [...message.data, {
              data: comment,
              children: []
            }]
            message.data.sort((a,b) =>  b.data.votes - a.data.votes)
          } else {
            this.branchTraverse(message.data, comment)
          }
        }
        peer.sendRequest(message.request, message.data);
      }
      else {
        var message             = {};
        message.request         = "reddit comment null";
        message.data            = {};
        message.data.msg        = "There don't seem to be any comments. Be the first to post!"
        peer.sendRequest(message.request, message.data);
      }
      return;
    }




    ///////////////////////////////
    // server -- post + comments //
    ///////////////////////////////
    if (msg.request === "reddit moderate approve") {

      var pid = msg.data.post_id;

      var sql    = "UPDATE posts SET approved = 1 WHERE post_id = $pid";
      var params = { $pid : pid }
      try  {
        this.db.run(sql, params);
      } catch(err) {
        console.log(err);
      }

      var sql2    = "UPDATE comments SET approved = 1 WHERE post_id = $pid";
      var params2 = { $pid : pid }
      try {
        this.db.run(sql, params);
      } catch(err) {
        console.log(err);
      }

      return;
    }

    if (msg.request === "reddit moderate delete") {

      try {
        var pid = msg.data.post_id;
        var sql    = "DELETE FROM posts WHERE post_id = $pid";
        var params = { $pid : pid }
        this.db.run(sql, params);

        var sql2    = "DELETE FROM comments WHERE post_id = $pid";
        var params2 = { $pid : pid }
        this.db.run(sql, params);

        reddit_self.clearCache();
      } catch(err) {
        console.log(err);
      }

      return;
    }





    ///////////////////////////////
    // server -- post + comments //
    ///////////////////////////////
    if (msg.request === "reddit load moderate") {

      var pid = msg.data.post_id;
      var cid = msg.data.comment_id;

      var sql = "SELECT * FROM posts WHERE reported > 0 AND approved = 0";
      try {
        var rows = await this.db.all(sql, {});
      } catch(err) {
        console.log(err);
      }

      if (rows != null) {
        for (var fat = rows.length-1; fat >= 0; fat--) {
          var message             = {};
          message.request         = "reddit post moderate";
          message.data            = {};
          message.data.id         = rows[fat].id;
          message.data.tx         = rows[fat].tx;
          message.data.unixtime   = rows[fat].unixtime;
          message.data.votes      = rows[fat].votes;
          message.data.comments   = rows[fat].comments;
          message.data.subreddit  = "";
          if (rows[fat].subreddit != null) {
            message.data.subreddit  = rows[fat].subreddit;
          }

          peer.sendRequest(message.request, message.data);

          // fetch comments
          var sql2 = "SELECT * FROM comments WHERE reported = 1 AND approved = 0";
          try {
            var rows2 = await this.db.all(sql2, {$pid: pid});
          } catch(err) {
            console.log(err);
          }
          if (rows2 != null) {
            for (var fat2 = 0; fat2 <= rows2.length-1; fat2++) {
              var message2             = {};
              message2.request         = "reddit comment moderate";
              message2.data            = {};
              message2.data.id         = rows2[fat2].id;
              message2.data.tx         = rows2[fat2].tx;
              message2.data.unixtime   = rows2[fat2].unixtime;
              message2.data.votes      = rows2[fat2].votes;
              peer.sendRequest(message2.request, message2.data);
            }
          }
        }
      }
      return;
    }



    //////////////////////////
    // client -- front page //
    //////////////////////////
    if (msg.request == "reddit load") {
      newtx = new saito.transaction(msg.data.tx);
      app.modules.returnModule("Reddit").addPost(newtx, msg, app, 0);
      return;
    }



    ////////////////////
    // client -- post //
    ////////////////////
    if (msg.request == "reddit post") {
      tx = msg.data.tx;
      newtx = new saito.transaction(tx);
      //console.log("CREATING NEW POST  TX", tx);
      app.modules.returnModule("Reddit").addPost(newtx, msg, app, 0);

      // recache main
      reddit_self.generateCachedPagePosts("main");
      reddit_self.lastCached = new Date().getTime();

      return;
    }

    if (msg.request == "reddit load null") {
      $('.loading_posts#loading_posts').hide();
    }

    ///////////////////////
    // client -- comment //
    ///////////////////////
    if (msg.request == "reddit comment") {
      tx = msg.data.tx;
      newtx = new saito.transaction(tx);
      app.modules.returnModule("Reddit").addComment(newtx, msg, app, 1);

      // recache main
      reddit_self.generateCachedPagePosts("main");
      reddit_self.lastCached = new Date().getTime();

      return;
    }

    ////////////////////////////////
    // client -- moderate comment //
    ////////////////////////////////
    if (msg.request == "reddit comment moderate") {
      tx = msg.data.tx;
      newtx = new saito.transaction(tx);
      app.modules.returnModule("Reddit").addModerate(newtx, msg, app, "comment");
      return;
    }

    /////////////////////////////
    // client -- moderate post //
    /////////////////////////////
    if (msg.request == "reddit post moderate") {
      tx = msg.data.tx;
      newtx = new saito.transaction(tx);
      app.modules.returnModule("Reddit").addModerate(newtx, msg, app, "post");
      return;
    }

}






///////////////////
// Confirmation //
//////////////////
Reddit.prototype.onConfirmation = function onConfirmation(blk, tx, conf, app) {

  if (tx.transaction.msg.module != "Reddit") { return; }

  // SERVER function
  if (app.BROWSER == 0) {
    if (conf == 0) {
      myreddit = app.modules.returnModule("Reddit");
      if (tx.transaction.msg.type == "edit_comment") { myreddit.editComment(tx); }
      if (tx.transaction.msg.type == "edit_post") { myreddit.editPost(tx); }
      if (tx.transaction.msg.type == "post") { myreddit.savePost(tx); }
      if (tx.transaction.msg.type == "comment" && (tx.transaction.msg.parent_id != null || tx.transaction.msg.post_id != null)) {
        myreddit.saveComment(tx, tx.transaction.msg.post_id, tx.transaction.msg.parent_id);
        myreddit.sendNotification(tx);
      }
    }
    return;
  }

}
Reddit.prototype.updatePostImg = async function updatePostImg(post_id, imgurl) {

/****
  console.log("Update our Image Post");

  var imgsql = "UPDATE posts SET image_url = $imgurl WHERE post_id = $pid";
  try {
    let row = await this.db.run(imgsql, {
      $imgurl: imgurl,
      $pid: post_id
    })
  } catch(err) {
    console.log(err);
  }
****/

}

Reddit.prototype.branchTraverse = function branchTraverse(branch, comment) {
  branch.forEach(node => {
    if (node.data.sig === comment.parent_id) {
      node.children.push({
        data: comment,
        children: []
      })
      node.children.sort((a,b) =>  b.data.votes - a.data.votes)
      return
    }
    else if (node.children !== []) {
      this.branchTraverse(node.children, comment)
    }
  })
}

Reddit.prototype.savePost = async function savePost(tx) {

  var reddit_self = this;

  // figure out what the URL is
  var myhref = tx.transaction.msg.link;
  if (myhref.indexOf("http://") != 0 && myhref.indexOf("https://") != 0) { myhref = "http://" + myhref; }

  var link   = new URL(myhref);

  var sql = "INSERT OR IGNORE INTO posts (tx, votes, comments, post_id, reported, approved, subreddit, unixtime, unixtime_rank, url, domain) VALUES ($tx, 1, 0, $post_id, 0, 0, $subreddit, $unixtime, $unixtime_rank, $url, $domain)";
  try {
    let row = await this.db.run(sql, {
      $tx: JSON.stringify(tx.transaction),
      $post_id: tx.transaction.sig,
      $subreddit: tx.transaction.msg.subreddit.toLowerCase(),
      $unixtime: tx.transaction.ts,
      $unixtime_rank: tx.transaction.ts,
      $url : link.href,
      $domain : link.hostname
    })
    if (row) {
      this.lastID = row.lastID;
      //console.log("LST ID", this.lastID);
    }
  } catch(err) {
    console.log(err);
  }

  //console.log("\n\n\n\nSAVED POST!\n\n\n");

  //////////////////////////////
  // generate new cached page //
  //////////////////////////////
  if (reddit_self.cacheEnabled == 1) {
    reddit_self.generateCachedPagePosts(tx.transaction.msg.subreddit);
    reddit_self.generateCachedPagePosts("main");
    reddit_self.lastCached = new Date().getTime();;
  }

  var snapshot_width     = 100;
  var snapshot_height    = 100;
  var snapshot_target    = link.href;
  var snapshot_localfile = this.lastID + ".png";
  var snapshot_dir       = reddit_self.snapshot_dir;
  var snapshot_filepath  = snapshot_dir + snapshot_localfile;

  var snapshot_img_url   = "";

  if (link.href != "") {

    var resolver = new ImageResolver();
    resolver.register(new ImageResolver.FileExtension());
    resolver.register(new ImageResolver.MimeType());
    resolver.register(new ImageResolver.Opengraph());
    resolver.register(new ImageResolver.Webpage());



    try {
      resolver.resolve(snapshot_target, (result) => {
        if ( result ) {
          //console.log("downloading: "+ result.image);
          snapshot_target = result.image;

    //
    // tell our database to update the image
    //
        reddit_self.updatePostImg(snapshot_target, tx.transaction.sig);

          request.head(snapshot_target, (err, res, body) => {
            if (!err) {
              //console.log('content-type:', res.headers['content-type']);
              //console.log('content-length:', res.headers['content-length']);
              request(snapshot_target).pipe(fs.createWriteStream(snapshot_filepath)).on('close', async () => {

                //console.log("About to JIMP this puppy");\
                let image
                try {
                  image = await Jimp.read(snapshot_filepath)
                } catch(error1) {
                  let temp = await new Promise(resolve => setTimeout(resolve, 600));
                  try {
                    image = await Jimp.read(snapshot_filepath);
                    debug('Success reading file on second attempt!');
                  } catch (error2) {
                    console.log(error2)
                    return
                  }
                }

                image.resize(snapshot_width, snapshot_height) // resize
                    .quality(60)                 // set JPEG quality
                    .write(snapshot_filepath); // save

                // Jimp.read(snapshot_filepath, (err, lenna) => {
                //   //console.log("JIMPing this puppy");
                //   if (err) { console.log(err); return;}
                //   lenna.resize(snapshot_width, snapshot_height) // resize
                //     .quality(60)                 // set JPEG quality
                //     .write(snapshot_filepath); // save
                //   //console.log("JIMPed: " + snapshot_filepath);
                // })
                //console.log('done: ' + result.image);
              });
            }
          });
        } else {
          //console.log( "No image found" );
        }
      });
    } catch(err) {
      console.log(err)
    }
  }
}

Reddit.prototype.saveComment = function saveComment(tx, post_id, parent_id) {

  var reddit_self = this;
  var sql = "INSERT OR IGNORE INTO comments (tx, votes, post_id, reported, approved, comment_id, parent_id, unixtime) VALUES ($tx, 1, $post_id, 0, 0, $comment_id, $parent_id, $unixtime)";
  try {
    this.db.run(sql, {
      $tx: JSON.stringify(tx.transaction),
      $post_id: post_id,
      $comment_id: tx.transaction.sig,
      $parent_id: parent_id,
      $unixtime: tx.transaction.ts
    });
  } catch(err) {
    console.log(err);
  }

  var sql2 = "UPDATE posts SET comments = comments + 1 WHERE post_id = $pid";
  var params2 = { $pid : post_id };
  try {
    this.db.run(sql2, params2);
  } catch(err) {
    console.log(err);
  }

  // generate new cached page
  if (reddit_self.cacheEnabledPost == 1) {
    reddit_self.generateCachedPagePostAndComments(post_id);
  }
  if (reddit_self.cacheEnabled == 1) {
    // recache main
    reddit_self.generateCachedPagePosts("main");
    reddit_self.lastCached = new Date().getTime();
  }
}





// set to async, change in other parts
Reddit.prototype.editComment = async function editComment(tx) {

  //
  // msg.module     = "Reddit";
  //  msg.type       = "edit_comment";
  //  msg.post_id    = $('.edit_post_id');
  //  msg.comment_id = $('.edit_comment_id');
  //  msg.data       = $('.edit_data').val();
  //

  var reddit_self = this;

  var sql = "SELECT * FROM comments WHERE comment_id = $cid";
  var params = { $cid : tx.transaction.msg.comment_id }
  var poster = "";
  var post_id = tx.transaction.msg.post_id;

//console.log(sql + " --- " + JSON.stringify(params));

  try {
    var rows = await this.db.all(sql, params);
    if (rows != null) {
//console.log(JSON.stringify(rows));
      var tmptx = new saito.transaction(rows[0].tx);
      tmptx.transaction.msg.text = tx.transaction.msg.data;
      poster = tmptx.transaction.from[0].add;
    }
  } catch(err) {
    console.log(err);
    return;
  }

  if (poster == "") { return; }

  if (tx.transaction.from[0].add != poster) {
    console.log("Refusing to update Reddit: poster not identical");
    return;
  }

//console.log("ABOUT TO UPDATE");

  var sql2 = "UPDATE comments SET tx = $tx WHERE comment_id = $cid";
  var params2 = { $tx : JSON.stringify(tmptx.transaction) , $cid : tx.transaction.msg.comment_id };
  try {
//console.log(sql2 + " -- " + JSON.stringify(params2));
    this.db.run(sql2, params2);
  } catch(err) {
    console.log(err);
  }

  //
  // clear cache
  //
  reddit_self.clearCache();

  // generate new cached page
  if (reddit_self.cacheEnabledPost == 1) {
      //console.log("POST ID: " + post_id);
    reddit_self.generateCachedPagePostAndComments(post_id);
  }

}








// set to async, change in other parts
Reddit.prototype.editPost = async function editPost(tx) {

  //
  //  msg.module     = "Reddit";
  //  msg.type       = "edit_post";
  //  msg.post_id    = $('.edit_post_id');
  //  msg.data       = $('.edit_data').val();
  //

  var reddit_self = this;

  var sql = "SELECT * FROM posts WHERE post_id = $pid";
  var params = { $pid : tx.transaction.msg.post_id }
  var poster = "";

//console.log(sql + " --- " + JSON.stringify(params));

  try {
    var rows = await this.db.all(sql, params);
    if (rows != null) {
//console.log(JSON.stringify(rows));
      var tmptx = new saito.transaction(rows[0].tx);
      tmptx.transaction.msg.text = tx.transaction.msg.data;
      poster = tmptx.transaction.from[0].add;
    }
  } catch(err) {
    console.log(err);
    return;
  }

  if (poster == "") { return; }

  if (tx.transaction.from[0].add != poster) {
//    console.log("Refusing to update dreddit: poster not identical");
    return;
  }

//console.log("ABOUT TO UPDATE");


  var sql2 = "UPDATE posts SET tx = $tx WHERE post_id = $pid";
  var params2 = { $tx : JSON.stringify(tmptx.transaction) , $pid : tx.transaction.msg.post_id };
  try {
//console.log(sql2 + " -- " + JSON.stringify(params2));
    this.db.run(sql2, params2);
  } catch(err) {
    console.log(err);
  }

  //
  // clear cache
  //
  reddit_self.clearCache();

  // generate new cached page
  if (reddit_self.cacheEnabledPost == 1) {
    //console.log("POST ID: " + tx.transaction.msg.post_id);
    reddit_self.generateCachedPagePostAndComments(tx.transaction.msg.post_id);
  }

}





// set to async, change in other parts
Reddit.prototype.generateCachedPagePosts = async function generateCachedPagePosts(sr) {

  if (this.app.BROWSER == 1) { return; }

  var reddit_self = this;

  //console.log("\n\n\n\n\nGENERATING WITH: "+sr);

  if (sr == "") { return; }

  var data_html = fs.readFileSync(__dirname + '/web/index.html', 'utf8', (err, data) => {});
  var data_posts = "";

  var sql = "SELECT * FROM posts WHERE subreddit = $sr ORDER BY unixtime_rank DESC LIMIT $ppp";
  var params = { $sr : sr , $ppp : reddit_self.reddit.posts_per_page };
  if (sr == "main") {
    sql = "SELECT * FROM posts ORDER BY unixtime_rank DESC LIMIT $ppp";
    params = { $ppp : reddit_self.reddit.posts_per_page };
  }

  try {
    var rows = await this.db.all(sql, params);
    if (rows != null) {
      for (var fat = 0; fat <= rows.length-1; fat++) {
        var tmptx = new saito.transaction(rows[fat].tx);

        var myhref = tmptx.transaction.msg.link;
        if (myhref.indexOf("http://") != 0 && myhref.indexOf("https://") != 0) { myhref = "http://" + myhref; }
        var link   = new URL(myhref);

        var content_title       = tmptx.transaction.msg.title;
        var cpost_id            = tmptx.transaction.sig;
        var content_subreddit   = '/r/'+tmptx.transaction.msg.subreddit;

        if (content_subreddit == '/r/') { content_subreddit = "/r/main"; }

        var content_site        = content_subreddit;
        var content_site_link   = "";

        var content_details     = "submitted by <span class=\"post_author_clickable\" id=\"post_author_clickable_"+cpost_id+"\">"+reddit_self.formatAuthor(tmptx.transaction.from[0].add)+'</span> to <a href="'+content_subreddit+'">'+content_subreddit+'</a><span class="post_author_address" id="'+tmptx.transaction.from[0].add+'" style="display:none"></span>';
        var content_link        = '/r/'+content_subreddit+'/'+cpost_id;
        var comments_link       = '/r/'+content_subreddit+'/'+cpost_id;
        if (link.href != "") { content_link = link.href; }
        if (link.hostname != "") {
          content_site      = link.hostname;
          content_site_link = "http://";
        }
        if (content_link === "http://") {
          content_link        = content_subreddit+'/'+cpost_id;
        }
        if (tmptx.transaction.msg.text != undefined) {
          if (tmptx.transaction.msg.text.length > 0) {
            content_link        = content_subreddit+'/'+cpost_id;
          }
        }
        var comment_thumbnail  = "/img/saito-logo-blue.png";

        var comments_text       = "read comments";
        if (rows[fat].comments == 1) { comments_text = "1 comment"; }
        if (rows[fat].comments > 1)  { comments_text = rows[fat].comments + " comments"; }
        var comment_thumbnail = "/r/screenshots/" + rows[fat].id + ".png";
        var votes_total       = rows[fat].votes;

        data_posts += reddit_self.returnPostHtml(rows[fat].post_id, tmptx.transaction.from[0].add, votes_total, comment_thumbnail, content_link, content_title, content_site_link, content_site, content_subreddit, content_details, comments_text);

      }

      data_html = data_html.replace('<div class="loading_posts" id="loading_posts">Loading....</div>','');
      if (sr != "main") {
        data_html = data_html.replace('>/r/<','>/r/'+sr+'/<');
        data_html = data_html.replace('href="/r/"','href="/r/'+sr+'"');
      }
      data_html = data_html.replace('subreddit = ""','subreddit = "'+sr+'"');
      data_html = data_html.replace('&nbsp;',data_posts);
      data_html = data_html.replace('&nbsp;','');
      data_html = data_html.replace('load_content_on_load = 1','load_content_on_load = 0; if ($(".post").length > 29) { $("#next").show(); }');

      //rewrite cached page
      var cachedFile = sr.replace(/\W/g, '') + ".html";

      fs.writeFileSync((__dirname + '/web/cache/' + cachedFile), data_html, function(err) {
        if (err) {
          return console.log(err);
        }
      });
    }
  } catch(err) {
    console.log(err);
  }
}




Reddit.prototype.generateCachedPagePostAndComments = async function generateCachedPagePostAndComments(post_id) {

  var reddit_self = this;

  if (post_id == "") { return; }

  var data_html = fs.readFileSync(__dirname + '/web/post.html', 'utf8', (err, data) => {});
  var data_posts = "";
  var jsscript = "";

  var sql = "SELECT * FROM posts WHERE post_id = $post_id";
  var params = { $post_id : post_id };
  var content_author = "";
  var votes_total = 1;

  try {
    let row = await this.db.all(sql, params);
    if (row != null) {

      var tmptx = new saito.transaction(row[0].tx);

//console.log("THIS TX: " + JSON.stringify(tmptx));

      var myhref = tmptx.transaction.msg.link;
      var link   = "";

      if (myhref != undefined) {
        if (myhref.indexOf("http://") != 0 && myhref.indexOf("https://") != 0) { myhref = "http://" + myhref; }
        link   = new URL(myhref);
      }

      var content_title       = tmptx.transaction.msg.title;
      var cpost_id            = tmptx.transaction.sig;
      var content_subreddit   = '/r/'+tmptx.transaction.msg.subreddit;

      if (content_subreddit == '/r/') { content_subreddit = "/r/main"; }

      var content_site        = content_subreddit;
      var content_site_link   = "";
      var content_details     = "submitted by <span class=\"post_author_clickable\" id=\"post_author_clickable_"+cpost_id+"\">"+reddit_self.formatAuthor(tmptx.transaction.from[0].add)+'</span> to <a href="'+content_subreddit+'">'+content_subreddit+'</a><span class="post_author_address" id="'+tmptx.transaction.from[0].add+'" style="display:none"></span>';
      var content_link        = '/r/'+content_subreddit+'/'+cpost_id;
      var comments_link       = '/r/'+content_subreddit+'/'+cpost_id;
      if (link.href != "") { content_link      = link.href; }
      if (link.hostname != "") {
        content_site      = link.hostname;
        content_site_link = "http://";
      }
      if (content_link === "http://") {
        content_link        = content_subreddit+'/'+cpost_id;
      }
      var comment_thumbnail  = "/img/saito-logo-blue.png";
      content_author = reddit_self.formatAuthor(tmptx.transaction.from[0].add);

      var comments_text       = "read comments";
      if (row[0].comments == 1) { comments_text = "1 comment"; }
      if (row[0].comments > 1)  { comments_text = row[0].comments + " comments"; }
      var comment_thumbnail = "/r/screenshots/" + row[0].id + ".png";
      votes_total           = row[0].votes;
      var content_text      = linkifyHtml(markdown.toHTML(tmptx.transaction.msg.text));

      jsscript = '<script type="text/javascript">$("#post_author").html("'+content_author.replace(/\"/g,"\\\"")+'");$("#d_votes > .votes > .votes_total").html('+votes_total+');$("#d_text").html("'+content_text.replace(/\"/g,"\\\"").replace(/\n/g,"\\\n")+'");$("#d_content_title").html("'+content_title.replace(/\"/g,"\\\"")+'");$("#d_content_details").html("'+content_details.replace(/\"/g,"\\\"")+'");$("#d_thumb").html("<img src=\''+comment_thumbnail.replace(/\"/g,"\\\"")+'\' class=\'thumbnail_image\' onerror=\'this.src=\\\"/img/saito_logo_grey.png\\\"\' /></div>");</script>';

      data_html = data_html.replace('&nbsp;',data_posts);
      data_html = data_html.replace('load_content_on_load = 1','load_content_on_load = 2');
      jsscript += '</body>';
      data_html = data_html.replace('</body>',jsscript);

      //console.log("___________________________________________");
      //console.log("THIS IS THE DATA WE ARE ADDING TO THE PAGE!");
      //console.log("___________________________________________");

      //rewrite cached page
      var cachedFile = post_id.replace(/\W/g, '') + ".html";

      fs.writeFileSync((__dirname + '/web/cache/' + cachedFile), data_html, function(err) {
        if (err) {
          return console.log(err);
        }
      });

    }
  } catch(err) {
    console.log(err);
  }

}

/**
 * Send notification to OP
 */
Reddit.prototype.sendNotification = async function sendNotification(tx) {
  txmsg = tx.returnMessage();

  if (txmsg.post_author == tx.transaction.from[0].add) { return; }
  newtx = this.app.wallet.createUnsignedTransactionWithDefaultFee(txmsg.post_author, 0.0);

  let author = txmsg.identifier == "" ? tx.transaction.from[0].add : txmsg.identifier;

  newtx.transaction.msg        = {};
  newtx.transaction.msg.module = "Email";
  newtx.transaction.msg.title  = `${author} commented on your post`;
  newtx.transaction.msg.data   = `Visit the comment at this url: ${txmsg.link}`;
  newtx = this.app.wallet.signTransaction(newtx);

  this.app.network.propagateTransaction(newtx);
}

////////////////////
// handle options //
////////////////////
Reddit.prototype.saveReddit = function saveReddit(app) {
  app.options.reddit = this.reddit;
  app.storage.saveOptions();
}

Reddit.prototype.updateBalance = function updateBalance(app) {
  if (app.BROWSER == 0) { return; }
  $('#balance_money').html(app.wallet.returnBalance().replace(/0+$/,'').replace(/\.$/,'\.0'));
}

Reddit.prototype.formatDate = function formateDate(unixtime) {

  // not unixtime? return as may be human-readable date
  if (unixtime.toString().length < 13) { return unixtime; }

  x    = new Date(unixtime);
  nowx = new Date();

  y = "";

  if (x.getMonth()+1 == 1) { y += "Jan "; }
  if (x.getMonth()+1 == 2) { y += "Feb "; }
  if (x.getMonth()+1 == 3) { y += "Mar "; }
  if (x.getMonth()+1 == 4) { y += "Apr "; }
  if (x.getMonth()+1 == 5) { y += "May "; }
  if (x.getMonth()+1 == 6) { y += "Jun "; }
  if (x.getMonth()+1 == 7) { y += "Jul "; }
  if (x.getMonth()+1 == 8) { y += "Aug "; }
  if (x.getMonth()+1 == 9) { y += "Sep "; }
  if (x.getMonth()+1 == 10) { y += "Oct "; }
  if (x.getMonth()+1 == 11) { y += "Nov "; }
  if (x.getMonth()+1 == 12) { y += "Dec "; }

  y += x.getDate();

  if (x.getFullYear() != nowx.getFullYear()) {
    y += " ";
    y += x.getFullYear();
  } else {
    if (x.getMonth() == nowx.getMonth() && x.getDate() == nowx.getDate()) {

      am_or_pm = "am";

      tmphour = x.getHours();
      tmpmins = x.getMinutes();

      if (tmphour >= 12) { if (tmphour > 12) { tmphour -= 12; }; am_or_pm = "pm"; }
      if (tmphour == 0) { tmphour = 12; };
      if (tmpmins < 10) {
        y = tmphour + ":0" + tmpmins + " "+am_or_pm;
      } else {
        y = tmphour + ":" + tmpmins + " "+am_or_pm;
      }

    }
  }

  return y;

}

Reddit.prototype.formatAuthor = function formatAuthor(author, app, msg=null) {

  if (app == null) { app = this.app; }

  x = this.app.keys.findByPublicKey(author);

  if (x != null) { if (x.identifiers.length > 0) { return x.identifiers[0]; } }

  if (this.isPublicKey(author) == 1) {
    if (msg != null) {
      app.dns.fetchIdentifier(author, function(answer) {

        if (app.dns.isRecordValid(answer) == 0) {
          console.log(answer);
          return;
        }

        dns_response = JSON.parse(answer);

        var tmpselect = "";
        if (msg.type == "post")    { tmpselect = "#post_box_" + msg.id + " > .post_header > .post_header_titlebox > .post_header_name"; }
        if (msg.type == "comment") { tmpselect = "#comment_name_" + msg.id; }
         $(tmpselect).html(dns_response.identifier);
      });
    }
    return author.substring(0, 8) + "...";
  }

  return author;

}

Reddit.prototype.isPublicKey = function isPublicKey(publickey) {
  if (publickey.length == 44 || publickey.length == 45) {
    if (publickey.indexOf("@") > 0) {} else {
      return 1;
    }
  }
  return 0;
}
