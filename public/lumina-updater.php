<?php
/**
 * Plugin Name: Lumina Agent
 * Plugin URI:  https://lumina.app
 * Description: Agente remoto para Lumina Soporte — gestiona plugins, temas, core y credenciales automáticamente.
 * Version: 2.0.0
 * Author: Lumina Soporte
 * Requires at least: 5.6
 * Requires PHP: 7.4
 *
 * Al activarse:
 *  1. Habilita Application Passwords si están deshabilitadas.
 *  2. Crea una Application Password para el usuario admin.
 *  3. Envía las credenciales de vuelta a Lumina vía webhook (si está configurado).
 *
 * Endpoints REST:
 *  GET  /lumina/v1/status         — Info del sitio (WP, PHP, WooCommerce, permisos)
 *  GET  /lumina/v1/plugins        — Listar todos los plugins con versiones y updates
 *  GET  /lumina/v1/themes         — Listar todos los temas con versiones y updates
 *  POST /lumina/v1/update-plugin  — Actualizar un plugin
 *  POST /lumina/v1/update-theme   — Actualizar un tema
 *  POST /lumina/v1/update-core    — Actualizar WordPress core
 *  POST /lumina/v1/setup          — Forzar re-setup de credenciales
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'LUMINA_AGENT_VERSION', '2.0.0' );
define( 'LUMINA_AGENT_OPTION_PREFIX', 'lumina_agent_' );

/* ================================================================
   ACTIVACIÓN — Auto-setup de Application Passwords
   ================================================================ */

register_activation_hook( __FILE__, 'lumina_agent_activate' );

function lumina_agent_activate() {
	// Habilitar Application Passwords permanentemente
	add_option( LUMINA_AGENT_OPTION_PREFIX . 'app_passwords_forced', '1' );

	// Crear Application Password
	lumina_agent_create_app_password();
}

register_deactivation_hook( __FILE__, 'lumina_agent_deactivate' );

function lumina_agent_deactivate() {
	// No eliminamos las credenciales al desactivar — el admin puede querer reactivar
}

/* ================================================================
   FILTRO — Forzar Application Passwords disponibles
   ================================================================ */

add_filter( 'wp_is_application_passwords_available', '__return_true', 999 );
add_filter( 'wp_is_application_passwords_available_for_user', '__return_true', 999 );

/* ================================================================
   CREAR APPLICATION PASSWORD
   ================================================================ */

function lumina_agent_create_app_password() {
	if ( ! class_exists( 'WP_Application_Passwords' ) ) {
		// WP < 5.6, Application Passwords no disponibles como clase
		return false;
	}

	// Buscar el primer admin disponible
	$admins = get_users( array(
		'role'    => 'administrator',
		'orderby' => 'ID',
		'order'   => 'ASC',
		'number'  => 5,
	) );

	if ( empty( $admins ) ) {
		update_option( LUMINA_AGENT_OPTION_PREFIX . 'setup_error', 'No se encontró ningún usuario administrador.' );
		return false;
	}

	// Preferir un admin que tenga capability update_plugins
	$admin = null;
	foreach ( $admins as $a ) {
		if ( user_can( $a, 'update_plugins' ) ) {
			$admin = $a;
			break;
		}
	}
	if ( ! $admin ) {
		$admin = $admins[0];
	}

	// Verificar si ya existe una Application Password de Lumina para este usuario
	$existing = WP_Application_Passwords::get_user_application_passwords( $admin->ID );
	foreach ( $existing as $ap ) {
		if ( isset( $ap['name'] ) && stripos( $ap['name'], 'Lumina' ) !== false ) {
			// Ya existe — eliminarla para regenerar
			WP_Application_Passwords::delete_application_password( $admin->ID, $ap['uuid'] );
			break;
		}
	}

	// Crear nueva Application Password
	$result = WP_Application_Passwords::create_new_application_password(
		$admin->ID,
		array( 'name' => 'Lumina Agent' )
	);

	if ( is_wp_error( $result ) ) {
		update_option( LUMINA_AGENT_OPTION_PREFIX . 'setup_error', $result->get_error_message() );
		return false;
	}

	// $result = [ 0 => 'plaintext_password', 1 => $item_array ]
	$plain_password = $result[0];

	// Guardar credenciales en options
	update_option( LUMINA_AGENT_OPTION_PREFIX . 'app_user', $admin->user_login );
	update_option( LUMINA_AGENT_OPTION_PREFIX . 'app_password', $plain_password );
	update_option( LUMINA_AGENT_OPTION_PREFIX . 'app_user_id', $admin->ID );
	update_option( LUMINA_AGENT_OPTION_PREFIX . 'setup_at', current_time( 'mysql' ) );
	delete_option( LUMINA_AGENT_OPTION_PREFIX . 'setup_error' );

	// Intentar enviar webhook a Lumina
	lumina_agent_send_webhook();

	return true;
}

/* ================================================================
   WEBHOOK — Enviar credenciales a Lumina
   ================================================================ */

function lumina_agent_send_webhook() {
	$api_url       = get_option( LUMINA_AGENT_OPTION_PREFIX . 'api_url', '' );
	$project_token = get_option( LUMINA_AGENT_OPTION_PREFIX . 'project_token', '' );

	if ( empty( $api_url ) || empty( $project_token ) ) {
		return false; // No configurado aún
	}

	$app_user = get_option( LUMINA_AGENT_OPTION_PREFIX . 'app_user', '' );
	$app_pass = get_option( LUMINA_AGENT_OPTION_PREFIX . 'app_password', '' );

	if ( empty( $app_user ) || empty( $app_pass ) ) {
		return false;
	}

	$webhook_url = trailingslashit( $api_url ) . 'functions/v1/plugin-callback';

	$payload = array(
		'project_token'  => $project_token,
		'site_url'       => home_url(),
		'wp_app_user'    => $app_user,
		'wp_app_password' => $app_pass,
		'wp_version'     => get_bloginfo( 'version' ),
		'php_version'    => phpversion(),
		'agent_version'  => LUMINA_AGENT_VERSION,
		'woocommerce'    => class_exists( 'WooCommerce' ),
		'multisite'      => is_multisite(),
	);

	$response = wp_remote_post( $webhook_url, array(
		'timeout' => 15,
		'headers' => array( 'Content-Type' => 'application/json' ),
		'body'    => wp_json_encode( $payload ),
	) );

	if ( is_wp_error( $response ) ) {
		update_option( LUMINA_AGENT_OPTION_PREFIX . 'webhook_error', $response->get_error_message() );
		update_option( LUMINA_AGENT_OPTION_PREFIX . 'webhook_sent', false );
		return false;
	}

	$code = wp_remote_retrieve_response_code( $response );
	$body = wp_remote_retrieve_body( $response );

	update_option( LUMINA_AGENT_OPTION_PREFIX . 'webhook_sent', $code >= 200 && $code < 300 );
	update_option( LUMINA_AGENT_OPTION_PREFIX . 'webhook_response', substr( $body, 0, 500 ) );
	update_option( LUMINA_AGENT_OPTION_PREFIX . 'webhook_sent_at', current_time( 'mysql' ) );
	delete_option( LUMINA_AGENT_OPTION_PREFIX . 'webhook_error' );

	return $code >= 200 && $code < 300;
}

/* ================================================================
   ADMIN PAGE — Settings bajo Herramientas
   ================================================================ */

add_action( 'admin_menu', 'lumina_agent_admin_menu' );

function lumina_agent_admin_menu() {
	add_management_page(
		'Lumina Agent',
		'Lumina Agent',
		'manage_options',
		'lumina-agent',
		'lumina_agent_settings_page'
	);
}

add_action( 'admin_init', 'lumina_agent_register_settings' );

function lumina_agent_register_settings() {
	register_setting( 'lumina_agent_settings', LUMINA_AGENT_OPTION_PREFIX . 'api_url', array(
		'sanitize_callback' => 'esc_url_raw',
	) );
	register_setting( 'lumina_agent_settings', LUMINA_AGENT_OPTION_PREFIX . 'project_token', array(
		'sanitize_callback' => 'sanitize_text_field',
	) );
}

function lumina_agent_settings_page() {
	// Handle manual actions
	if ( isset( $_POST['lumina_reconnect'] ) && check_admin_referer( 'lumina_agent_reconnect' ) ) {
		lumina_agent_create_app_password();
		echo '<div class="notice notice-success"><p>Credenciales regeneradas y webhook enviado.</p></div>';
	}
	if ( isset( $_POST['lumina_send_webhook'] ) && check_admin_referer( 'lumina_agent_send_webhook' ) ) {
		$sent = lumina_agent_send_webhook();
		echo $sent
			? '<div class="notice notice-success"><p>Webhook enviado correctamente.</p></div>'
			: '<div class="notice notice-error"><p>Error al enviar webhook. Verifica la URL y el token.</p></div>';
	}

	$api_url       = get_option( LUMINA_AGENT_OPTION_PREFIX . 'api_url', '' );
	$project_token = get_option( LUMINA_AGENT_OPTION_PREFIX . 'project_token', '' );
	$app_user      = get_option( LUMINA_AGENT_OPTION_PREFIX . 'app_user', '' );
	$app_pass      = get_option( LUMINA_AGENT_OPTION_PREFIX . 'app_password', '' );
	$setup_at      = get_option( LUMINA_AGENT_OPTION_PREFIX . 'setup_at', '' );
	$setup_error   = get_option( LUMINA_AGENT_OPTION_PREFIX . 'setup_error', '' );
	$webhook_sent  = get_option( LUMINA_AGENT_OPTION_PREFIX . 'webhook_sent', false );
	$webhook_at    = get_option( LUMINA_AGENT_OPTION_PREFIX . 'webhook_sent_at', '' );
	$webhook_error = get_option( LUMINA_AGENT_OPTION_PREFIX . 'webhook_error', '' );

	$is_connected = ! empty( $app_user ) && ! empty( $app_pass ) && ! empty( $setup_at );
	$masked_pass  = $app_pass ? substr( $app_pass, 0, 4 ) . ' •••• •••• •••• •••• ' . substr( $app_pass, -4 ) : '—';

	?>
	<div class="wrap">
		<h1>Lumina Agent <span style="font-size:12px;color:#888;">v<?php echo LUMINA_AGENT_VERSION; ?></span></h1>

		<div style="display:flex;gap:20px;flex-wrap:wrap;">
			<!-- Status Card -->
			<div style="flex:1;min-width:300px;background:#fff;border:1px solid #c3c4c7;border-radius:8px;padding:20px;">
				<h2 style="margin-top:0;">Estado de Conexion</h2>
				<table class="form-table" style="margin:0;">
					<tr>
						<th>Application Password</th>
						<td>
							<?php if ( $is_connected ): ?>
								<span style="color:#00a32a;font-weight:bold;">&#10003; Configurada</span>
							<?php else: ?>
								<span style="color:#d63638;font-weight:bold;">&#10007; No configurada</span>
							<?php endif; ?>
						</td>
					</tr>
					<tr>
						<th>Usuario WP</th>
						<td><code><?php echo esc_html( $app_user ?: '—' ); ?></code></td>
					</tr>
					<tr>
						<th>App Password</th>
						<td><code><?php echo esc_html( $masked_pass ); ?></code></td>
					</tr>
					<tr>
						<th>Generada</th>
						<td><?php echo esc_html( $setup_at ?: '—' ); ?></td>
					</tr>
					<?php if ( $setup_error ): ?>
					<tr>
						<th>Error Setup</th>
						<td style="color:#d63638;"><?php echo esc_html( $setup_error ); ?></td>
					</tr>
					<?php endif; ?>
					<tr>
						<th>Webhook a Lumina</th>
						<td>
							<?php if ( $webhook_sent ): ?>
								<span style="color:#00a32a;">&#10003; Enviado</span>
								<?php if ( $webhook_at ): ?>
									<br><small>Ultimo: <?php echo esc_html( $webhook_at ); ?></small>
								<?php endif; ?>
							<?php elseif ( $webhook_error ): ?>
								<span style="color:#d63638;">&#10007; Error: <?php echo esc_html( $webhook_error ); ?></span>
							<?php else: ?>
								<span style="color:#888;">Pendiente — configura la URL y token abajo</span>
							<?php endif; ?>
						</td>
					</tr>
				</table>

				<div style="margin-top:15px;display:flex;gap:10px;">
					<form method="post" style="margin:0;">
						<?php wp_nonce_field( 'lumina_agent_reconnect' ); ?>
						<button type="submit" name="lumina_reconnect" class="button button-secondary">
							Regenerar Credenciales
						</button>
					</form>
					<?php if ( $api_url && $project_token ): ?>
					<form method="post" style="margin:0;">
						<?php wp_nonce_field( 'lumina_agent_send_webhook' ); ?>
						<button type="submit" name="lumina_send_webhook" class="button button-secondary">
							Reenviar Webhook
						</button>
					</form>
					<?php endif; ?>
				</div>
			</div>

			<!-- Config Card -->
			<div style="flex:1;min-width:300px;background:#fff;border:1px solid #c3c4c7;border-radius:8px;padding:20px;">
				<h2 style="margin-top:0;">Conexion con Lumina</h2>
				<p style="color:#666;font-size:13px;">Estos datos los encuentras en Lumina Soporte al crear o editar tu proyecto.</p>
				<form method="post" action="options.php">
					<?php settings_fields( 'lumina_agent_settings' ); ?>
					<table class="form-table" style="margin:0;">
						<tr>
							<th>URL de Lumina API</th>
							<td>
								<input type="url" name="<?php echo LUMINA_AGENT_OPTION_PREFIX; ?>api_url"
									value="<?php echo esc_attr( $api_url ); ?>"
									class="regular-text" placeholder="https://xxxxx.supabase.co" />
								<p class="description">URL base de Supabase de tu instancia de Lumina.</p>
							</td>
						</tr>
						<tr>
							<th>Token del Proyecto</th>
							<td>
								<input type="text" name="<?php echo LUMINA_AGENT_OPTION_PREFIX; ?>project_token"
									value="<?php echo esc_attr( $project_token ); ?>"
									class="regular-text" placeholder="uuid-del-proyecto" />
								<p class="description">El ID del proyecto en Lumina Soporte.</p>
							</td>
						</tr>
					</table>
					<?php submit_button( 'Guardar Configuracion' ); ?>
				</form>
			</div>
		</div>

		<!-- Endpoints info -->
		<div style="margin-top:20px;background:#fff;border:1px solid #c3c4c7;border-radius:8px;padding:20px;">
			<h2 style="margin-top:0;">Endpoints Disponibles</h2>
			<p style="color:#666;font-size:13px;">Estos endpoints requieren autenticacion via Application Password (Basic Auth).</p>
			<table class="widefat" style="max-width:800px;">
				<thead>
					<tr><th>Metodo</th><th>Endpoint</th><th>Descripcion</th></tr>
				</thead>
				<tbody>
					<tr><td><code>GET</code></td><td><code>/wp-json/lumina/v1/status</code></td><td>Info del sitio</td></tr>
					<tr><td><code>GET</code></td><td><code>/wp-json/lumina/v1/plugins</code></td><td>Listar plugins con versiones y updates</td></tr>
					<tr><td><code>GET</code></td><td><code>/wp-json/lumina/v1/themes</code></td><td>Listar temas con versiones y updates</td></tr>
					<tr><td><code>POST</code></td><td><code>/wp-json/lumina/v1/update-plugin</code></td><td>Actualizar un plugin</td></tr>
					<tr><td><code>POST</code></td><td><code>/wp-json/lumina/v1/update-theme</code></td><td>Actualizar un tema</td></tr>
					<tr><td><code>POST</code></td><td><code>/wp-json/lumina/v1/update-core</code></td><td>Actualizar WordPress Core</td></tr>
					<tr><td><code>POST</code></td><td><code>/wp-json/lumina/v1/setup</code></td><td>Regenerar credenciales</td></tr>
				</tbody>
			</table>
		</div>
	</div>
	<?php
}

/* ================================================================
   REST API ROUTES
   ================================================================ */

add_action( 'rest_api_init', 'lumina_agent_register_routes' );

function lumina_agent_register_routes() {

	// ── GET /lumina/v1/status ──
	register_rest_route( 'lumina/v1', '/status', array(
		'methods'             => 'GET',
		'callback'            => 'lumina_agent_status_callback',
		'permission_callback' => 'lumina_agent_can_manage',
	) );

	// ── GET /lumina/v1/plugins ──
	register_rest_route( 'lumina/v1', '/plugins', array(
		'methods'             => 'GET',
		'callback'            => 'lumina_agent_plugins_callback',
		'permission_callback' => 'lumina_agent_can_manage',
	) );

	// ── GET /lumina/v1/themes ──
	register_rest_route( 'lumina/v1', '/themes', array(
		'methods'             => 'GET',
		'callback'            => 'lumina_agent_themes_callback',
		'permission_callback' => 'lumina_agent_can_manage',
	) );

	// ── POST /lumina/v1/update-plugin ──
	register_rest_route( 'lumina/v1', '/update-plugin', array(
		'methods'             => 'POST',
		'callback'            => 'lumina_agent_update_plugin_callback',
		'permission_callback' => function () {
			return current_user_can( 'update_plugins' );
		},
		'args' => array(
			'plugin' => array(
				'required'          => true,
				'type'              => 'string',
				'sanitize_callback' => 'sanitize_text_field',
			),
		),
	) );

	// ── POST /lumina/v1/update-theme ──
	register_rest_route( 'lumina/v1', '/update-theme', array(
		'methods'             => 'POST',
		'callback'            => 'lumina_agent_update_theme_callback',
		'permission_callback' => function () {
			return current_user_can( 'update_themes' );
		},
		'args' => array(
			'theme' => array(
				'required'          => true,
				'type'              => 'string',
				'sanitize_callback' => 'sanitize_text_field',
			),
		),
	) );

	// ── POST /lumina/v1/update-core ──
	register_rest_route( 'lumina/v1', '/update-core', array(
		'methods'             => 'POST',
		'callback'            => 'lumina_agent_update_core_callback',
		'permission_callback' => function () {
			return current_user_can( 'update_core' );
		},
	) );

	// ── POST /lumina/v1/setup ──
	register_rest_route( 'lumina/v1', '/setup', array(
		'methods'             => 'POST',
		'callback'            => 'lumina_agent_setup_callback',
		'permission_callback' => function () {
			return current_user_can( 'manage_options' );
		},
	) );
}

function lumina_agent_can_manage() {
	return current_user_can( 'activate_plugins' );
}

/* ================================================================
   GET /lumina/v1/status — Info del sitio
   ================================================================ */

function lumina_agent_status_callback() {
	global $wp_version;

	require_once ABSPATH . 'wp-admin/includes/plugin.php';
	require_once ABSPATH . 'wp-admin/includes/update.php';

	$current_user = wp_get_current_user();

	// WooCommerce info
	$woo_active  = class_exists( 'WooCommerce' );
	$woo_version = $woo_active && defined( 'WC_VERSION' ) ? WC_VERSION : null;

	// Plugin/theme counts
	$all_plugins    = get_plugins();
	$active_plugins = get_option( 'active_plugins', array() );

	$update_plugins = get_site_transient( 'update_plugins' );
	$update_themes  = get_site_transient( 'update_themes' );

	$plugins_with_updates = ! empty( $update_plugins->response ) ? count( $update_plugins->response ) : 0;
	$themes_with_updates  = ! empty( $update_themes->response ) ? count( $update_themes->response ) : 0;

	// Core update
	$core_updates     = get_core_updates();
	$core_update_avail = false;
	$core_latest       = $wp_version;
	if ( ! empty( $core_updates ) && is_array( $core_updates ) ) {
		foreach ( $core_updates as $cu ) {
			if ( isset( $cu->response ) && $cu->response === 'upgrade' ) {
				$core_update_avail = true;
				$core_latest       = $cu->version ?? $wp_version;
				break;
			}
		}
	}

	return new WP_REST_Response( array(
		'success'       => true,
		'agent_version' => LUMINA_AGENT_VERSION,
		'site_url'      => home_url(),
		'admin_url'     => admin_url(),
		'wp_version'    => $wp_version,
		'wp_latest'     => $core_latest,
		'core_update'   => $core_update_avail,
		'php_version'   => phpversion(),
		'mysql_version' => $GLOBALS['wpdb']->db_version(),
		'multisite'     => is_multisite(),
		'woocommerce'   => $woo_active,
		'woo_version'   => $woo_version,
		'locale'        => get_locale(),
		'timezone'      => wp_timezone_string(),
		'memory_limit'  => WP_MEMORY_LIMIT,
		'debug_mode'    => WP_DEBUG,
		'ssl'           => is_ssl(),
		'plugins_total' => count( $all_plugins ),
		'plugins_active' => count( $active_plugins ),
		'plugins_updates' => $plugins_with_updates,
		'themes_updates'  => $themes_with_updates,
		'current_user'  => array(
			'login' => $current_user->user_login,
			'roles' => $current_user->roles,
			'caps'  => array(
				'update_plugins' => current_user_can( 'update_plugins' ),
				'update_themes'  => current_user_can( 'update_themes' ),
				'update_core'    => current_user_can( 'update_core' ),
				'install_plugins' => current_user_can( 'install_plugins' ),
				'activate_plugins' => current_user_can( 'activate_plugins' ),
			),
		),
	), 200 );
}

/* ================================================================
   GET /lumina/v1/plugins — Listar plugins con versiones y updates
   ================================================================ */

function lumina_agent_plugins_callback() {
	require_once ABSPATH . 'wp-admin/includes/plugin.php';
	require_once ABSPATH . 'wp-admin/includes/update.php';

	// Force refresh update transient
	wp_update_plugins();
	$update_plugins = get_site_transient( 'update_plugins' );
	$all_plugins    = get_plugins();
	$active_plugins = get_option( 'active_plugins', array() );
	$auto_updates   = get_option( 'auto_update_plugins', array() );

	$result = array();

	foreach ( $all_plugins as $file => $data ) {
		$slug = dirname( $file );
		if ( $slug === '.' ) {
			$slug = basename( $file, '.php' );
		}

		$latest_version = '';
		$update_package = '';
		if ( ! empty( $update_plugins->response[ $file ] ) ) {
			$upd            = $update_plugins->response[ $file ];
			$latest_version = $upd->new_version ?? '';
			$update_package = $upd->package ?? '';
		}

		$result[] = array(
			'name'            => $data['Name'] ?? '',
			'slug'            => $slug,
			'plugin_file'     => $file,
			'current_version' => $data['Version'] ?? '',
			'latest_version'  => $latest_version,
			'has_update'      => ! empty( $latest_version ) && $latest_version !== ( $data['Version'] ?? '' ),
			'update_package'  => $update_package,
			'is_active'       => in_array( $file, $active_plugins, true ),
			'auto_update'     => in_array( $file, $auto_updates, true ),
			'author'          => wp_strip_all_tags( $data['Author'] ?? '' ),
			'plugin_uri'      => $data['PluginURI'] ?? '',
			'description'     => wp_strip_all_tags( $data['Description'] ?? '' ),
			'requires_wp'     => $data['RequiresWP'] ?? '',
			'requires_php'    => $data['RequiresPHP'] ?? '',
			'network_active'  => is_multisite() && is_plugin_active_for_network( $file ),
		);
	}

	return new WP_REST_Response( array(
		'success' => true,
		'count'   => count( $result ),
		'plugins' => $result,
	), 200 );
}

/* ================================================================
   GET /lumina/v1/themes — Listar temas con versiones y updates
   ================================================================ */

function lumina_agent_themes_callback() {
	require_once ABSPATH . 'wp-admin/includes/update.php';

	wp_update_themes();
	$update_themes = get_site_transient( 'update_themes' );
	$all_themes    = wp_get_themes();
	$active_theme  = get_stylesheet();
	$auto_updates  = get_option( 'auto_update_themes', array() );

	$result = array();

	foreach ( $all_themes as $slug => $theme ) {
		$latest_version = '';
		if ( ! empty( $update_themes->response[ $slug ] ) ) {
			$latest_version = $update_themes->response[ $slug ]['new_version'] ?? '';
		}

		$result[] = array(
			'name'            => $theme->get( 'Name' ),
			'slug'            => $slug,
			'current_version' => $theme->get( 'Version' ),
			'latest_version'  => $latest_version,
			'has_update'      => ! empty( $latest_version ) && $latest_version !== $theme->get( 'Version' ),
			'is_active'       => $slug === $active_theme,
			'auto_update'     => in_array( $slug, $auto_updates, true ),
			'author'          => wp_strip_all_tags( $theme->get( 'Author' ) ),
			'parent_theme'    => $theme->parent() ? $theme->parent()->get_stylesheet() : null,
			'is_child_theme'  => (bool) $theme->parent(),
		);
	}

	return new WP_REST_Response( array(
		'success' => true,
		'count'   => count( $result ),
		'themes'  => $result,
	), 200 );
}

/* ================================================================
   POST /lumina/v1/setup — Forzar re-setup
   ================================================================ */

function lumina_agent_setup_callback( WP_REST_Request $request ) {
	$created = lumina_agent_create_app_password();

	if ( ! $created ) {
		$error = get_option( LUMINA_AGENT_OPTION_PREFIX . 'setup_error', 'Error desconocido' );
		return new WP_REST_Response( array(
			'success' => false,
			'error'   => $error,
		), 500 );
	}

	$app_user = get_option( LUMINA_AGENT_OPTION_PREFIX . 'app_user', '' );
	$webhook  = get_option( LUMINA_AGENT_OPTION_PREFIX . 'webhook_sent', false );

	return new WP_REST_Response( array(
		'success'      => true,
		'app_user'     => $app_user,
		'webhook_sent' => (bool) $webhook,
		'message'      => 'Credenciales regeneradas correctamente.',
	), 200 );
}

/* ================================================================
   POST /lumina/v1/update-plugin — Actualizar un plugin
   ================================================================ */

function lumina_agent_update_plugin_callback( WP_REST_Request $request ) {
	$plugin_file = $request->get_param( 'plugin' );

	if ( ! file_exists( WP_PLUGIN_DIR . '/' . $plugin_file ) ) {
		if ( ! str_ends_with( $plugin_file, '.php' ) && file_exists( WP_PLUGIN_DIR . '/' . $plugin_file . '.php' ) ) {
			$plugin_file .= '.php';
		} else {
			return new WP_REST_Response( array(
				'success' => false,
				'error'   => 'Plugin not found: ' . $plugin_file,
			), 404 );
		}
	}

	require_once ABSPATH . 'wp-admin/includes/class-wp-upgrader.php';
	require_once ABSPATH . 'wp-admin/includes/plugin.php';
	require_once ABSPATH . 'wp-admin/includes/file.php';
	require_once ABSPATH . 'wp-admin/includes/misc.php';

	$update_plugins = get_site_transient( 'update_plugins' );
	if ( empty( $update_plugins->response[ $plugin_file ] ) ) {
		wp_update_plugins();
		$update_plugins = get_site_transient( 'update_plugins' );
	}
	if ( empty( $update_plugins->response[ $plugin_file ] ) ) {
		return new WP_REST_Response( array(
			'success' => false,
			'error'   => 'No update available for this plugin.',
			'plugin'  => $plugin_file,
		), 200 );
	}

	$new_version = $update_plugins->response[ $plugin_file ]->new_version ?? 'unknown';

	$skin     = new Automatic_Upgrader_Skin();
	$upgrader = new Plugin_Upgrader( $skin );
	$result   = $upgrader->upgrade( $plugin_file );

	if ( is_wp_error( $result ) ) {
		return new WP_REST_Response( array(
			'success' => false,
			'error'   => $result->get_error_message(),
			'plugin'  => $plugin_file,
		), 500 );
	}

	if ( $result === false ) {
		$feedback = $skin->get_upgrade_messages();
		return new WP_REST_Response( array(
			'success' => false,
			'error'   => 'Upgrade failed. ' . implode( ' ', $feedback ),
			'plugin'  => $plugin_file,
		), 500 );
	}

	$activate_result = activate_plugin( $plugin_file );
	$activated       = ! is_wp_error( $activate_result );
	$plugin_data     = get_plugin_data( WP_PLUGIN_DIR . '/' . $plugin_file );

	return new WP_REST_Response( array(
		'success'     => true,
		'plugin'      => $plugin_file,
		'old_version' => $new_version,
		'new_version' => $plugin_data['Version'] ?? $new_version,
		'name'        => $plugin_data['Name'] ?? '',
		'activated'   => $activated,
	), 200 );
}

/* ================================================================
   POST /lumina/v1/update-theme — Actualizar un tema
   ================================================================ */

function lumina_agent_update_theme_callback( WP_REST_Request $request ) {
	$theme_slug = $request->get_param( 'theme' );

	$theme = wp_get_theme( $theme_slug );
	if ( ! $theme->exists() ) {
		return new WP_REST_Response( array(
			'success' => false,
			'error'   => 'Theme not found: ' . $theme_slug,
		), 404 );
	}

	require_once ABSPATH . 'wp-admin/includes/class-wp-upgrader.php';
	require_once ABSPATH . 'wp-admin/includes/theme.php';
	require_once ABSPATH . 'wp-admin/includes/file.php';
	require_once ABSPATH . 'wp-admin/includes/misc.php';

	$update_themes = get_site_transient( 'update_themes' );
	if ( empty( $update_themes->response[ $theme_slug ] ) ) {
		wp_update_themes();
		$update_themes = get_site_transient( 'update_themes' );
	}
	if ( empty( $update_themes->response[ $theme_slug ] ) ) {
		return new WP_REST_Response( array(
			'success' => false,
			'error'   => 'No update available for this theme.',
			'theme'   => $theme_slug,
		), 200 );
	}

	$skin     = new Automatic_Upgrader_Skin();
	$upgrader = new Theme_Upgrader( $skin );
	$result   = $upgrader->upgrade( $theme_slug );

	if ( is_wp_error( $result ) ) {
		return new WP_REST_Response( array(
			'success' => false,
			'error'   => $result->get_error_message(),
			'theme'   => $theme_slug,
		), 500 );
	}

	$updated_theme = wp_get_theme( $theme_slug );

	return new WP_REST_Response( array(
		'success'     => true,
		'theme'       => $theme_slug,
		'new_version' => $updated_theme->get( 'Version' ),
		'name'        => $updated_theme->get( 'Name' ),
	), 200 );
}

/* ================================================================
   POST /lumina/v1/update-core — Actualizar WordPress core
   ================================================================ */

function lumina_agent_update_core_callback( WP_REST_Request $request ) {
	require_once ABSPATH . 'wp-admin/includes/class-wp-upgrader.php';
	require_once ABSPATH . 'wp-admin/includes/file.php';
	require_once ABSPATH . 'wp-admin/includes/misc.php';
	require_once ABSPATH . 'wp-admin/includes/update.php';

	wp_version_check();

	$updates = get_core_updates();
	if ( empty( $updates ) || ! is_array( $updates ) || $updates[0]->response === 'latest' ) {
		return new WP_REST_Response( array(
			'success' => false,
			'error'   => 'WordPress is already up to date.',
		), 200 );
	}

	$update   = $updates[0];
	$skin     = new Automatic_Upgrader_Skin();
	$upgrader = new Core_Upgrader( $skin );
	$result   = $upgrader->upgrade( $update );

	if ( is_wp_error( $result ) ) {
		return new WP_REST_Response( array(
			'success' => false,
			'error'   => $result->get_error_message(),
		), 500 );
	}

	global $wp_version;

	return new WP_REST_Response( array(
		'success'     => true,
		'new_version' => $result ?? $wp_version,
	), 200 );
}
