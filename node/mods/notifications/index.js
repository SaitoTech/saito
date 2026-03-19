module.exports = (app, mod, build_number) => {
	return `

<!DOCTYPE html>
<html>
  <head>
    <title>Notifications</title>
    <meta charset="utf-8" />
  </head>

  <body>
    <div id="saito-container"></div>

    <script type="text/javascript">
      var active_module = '${mod.returnSlug()}';
    </script>

    <script src="/saito/saito.js?build=${build_number}"></script>
  </body>
</html>
`;
};

