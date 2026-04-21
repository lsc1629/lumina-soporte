<?php
/**
 * Plugin Name: Lumina Agent
 * Plugin URI:  https://lumina.app
 * Description: Conecta tu sitio WordPress con Lumina — monitoreo, actualizaciones y gestión remota con una sola API Key.
 * Version: 3.0.0
 * Author: Lumina
 * Requires at least: 5.6
 * Requires PHP: 7.4
 *
 * Flujo:
 *  1. El usuario copia su API Key desde el dashboard de Lumina.
 *  2. En WP Admin → Ajustes → Lumina Agent, pega la API Key y guarda.
 *  3. El plugin valida la key contra Lumina y auto-registra el sitio.
 *  4. Lumina se comunica con el sitio usando un site_token único.
 *
 * Endpoints REST (autenticados via site_token en header X-Lumina-Token):
 *  GET  /lumina/v1/status         — Info del sitio
 *  GET  /lumina/v1/plugins        — Listar plugins
 *  GET  /lumina/v1/themes         — Listar temas
 *  POST /lumina/v1/update-plugin  — Actualizar un plugin
 *  POST /lumina/v1/update-theme   — Actualizar un tema
 *  POST /lumina/v1/update-core    — Actualizar WordPress core
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'LUMINA_AGENT_VERSION', '3.0.0' );
define( 'LUMINA_AGENT_OPT', 'lumina_agent_' );
// URL base de la API de Lumina (Supabase Edge Functions)
define( 'LUMINA_API_BASE', 'https://vwddlfdhuajgssjqeomm.supabase.co/functions/v1' );

/* ================================================================
   ADMIN MENU — Settings bajo Ajustes
   ================================================================ */

add_action( 'admin_menu', 'lumina_agent_admin_menu' );

function lumina_agent_admin_menu() {
	add_options_page(
		'Lumina Agent',
		'Lumina Agent',
		'manage_options',
		'lumina-agent',
		'lumina_agent_settings_page'
	);
}

add_action( 'admin_init', 'lumina_agent_register_settings' );

function lumina_agent_register_settings() {
	register_setting( 'lumina_agent_settings', LUMINA_AGENT_OPT . 'api_key', array(
		'sanitize_callback' => 'lumina_agent_sanitize_api_key',
	) );
}

/**
 * Sanitize + validate + auto-register al guardar la API Key
 */
function lumina_agent_sanitize_api_key( $value ) {
	$value = sanitize_text_field( $value );

	if ( empty( $value ) ) {
		// Si se borra la key, desconectar
		delete_option( LUMINA_AGENT_OPT . 'connected' );
		delete_option( LUMINA_AGENT_OPT . 'site_token' );
		delete_option( LUMINA_AGENT_OPT . 'project_id' );
		delete_option( LUMINA_AGENT_OPT . 'connected_at' );
		delete_option( LUMINA_AGENT_OPT . 'error' );
		add_settings_error( 'lumina_agent_settings', 'disconnected', 'Lumina Agent desconectado.', 'updated' );
		return '';
	}

	if ( strpos( $value, 'lmn_' ) !== 0 ) {
		add_settings_error( 'lumina_agent_settings', 'invalid_key', 'API Key inválida. Debe comenzar con "lmn_".', 'error' );
		return get_option( LUMINA_AGENT_OPT . 'api_key', '' );
	}

	// Validar la key contra Lumina
	$validate_response = wp_remote_post( LUMINA_API_BASE . '/validate-api-key', array(
		'timeout' => 15,
		'headers' => array( 'Content-Type' => 'application/json' ),
		'body'    => wp_json_encode( array( 'api_key' => $value ) ),
	) );

	if ( is_wp_error( $validate_response ) ) {
		add_settings_error( 'lumina_agent_settings', 'validate_error',
			'No se pudo conectar con Lumina: ' . $validate_response->get_error_message(), 'error' );
		return get_option( LUMINA_AGENT_OPT . 'api_key', '' );
	}

	$validate_body = json_decode( wp_remote_retrieve_body( $validate_response ), true );
	$validate_code = wp_remote_retrieve_response_code( $validate_response );

	if ( $validate_code !== 200 || empty( $validate_body['valid'] ) ) {
		$err = $validate_body['error'] ?? 'API Key no válida.';
		add_settings_error( 'lumina_agent_settings', 'invalid_key', $err, 'error' );
		delete_option( LUMINA_AGENT_OPT . 'connected' );
		return get_option( LUMINA_AGENT_OPT . 'api_key', '' );
	}

	// Key válida — ahora registrar el sitio
	$site_info = lumina_agent_collect_site_info();
	$register_payload = array_merge( $site_info, array( 'api_key' => $value ) );

	$register_response = wp_remote_post( LUMINA_API_BASE . '/register-site', array(
		'timeout' => 20,
		'headers' => array( 'Content-Type' => 'application/json' ),
		'body'    => wp_json_encode( $register_payload ),
	) );

	if ( is_wp_error( $register_response ) ) {
		add_settings_error( 'lumina_agent_settings', 'register_error',
			'Key válida pero error al registrar sitio: ' . $register_response->get_error_message(), 'error' );
		return $value; // Guardar la key aunque falle el registro
	}

	$register_body = json_decode( wp_remote_retrieve_body( $register_response ), true );
	$register_code = wp_remote_retrieve_response_code( $register_response );

	if ( $register_code === 200 && ! empty( $register_body['success'] ) ) {
		// Guardar datos de conexión
		update_option( LUMINA_AGENT_OPT . 'connected', true );
		update_option( LUMINA_AGENT_OPT . 'site_token', $register_body['site_token'] ?? '' );
		update_option( LUMINA_AGENT_OPT . 'project_id', $register_body['project_id'] ?? '' );
		update_option( LUMINA_AGENT_OPT . 'connected_at', current_time( 'mysql' ) );
		delete_option( LUMINA_AGENT_OPT . 'error' );

		$msg = $register_body['is_new']
			? '¡Sitio registrado exitosamente en Lumina!'
			: '¡Sitio reconectado a Lumina!';
		add_settings_error( 'lumina_agent_settings', 'connected', $msg, 'updated' );
	} else {
		$err = $register_body['error'] ?? 'Error desconocido al registrar el sitio.';
		add_settings_error( 'lumina_agent_settings', 'register_error', $err, 'error' );
	}

	return $value;
}

/**
 * Recopilar información del sitio para enviar durante el registro
 */
function lumina_agent_collect_site_info() {
	global $wp_version;

	require_once ABSPATH . 'wp-admin/includes/plugin.php';

	$all_plugins    = get_plugins();
	$active_plugins = get_option( 'active_plugins', array() );
	$all_themes     = wp_get_themes();

	return array(
		'site_url'      => home_url(),
		'site_name'     => get_bloginfo( 'name' ),
		'wp_version'    => $wp_version,
		'php_version'   => phpversion(),
		'agent_version' => LUMINA_AGENT_VERSION,
		'woocommerce'   => class_exists( 'WooCommerce' ),
		'multisite'     => is_multisite(),
		'plugins_count' => count( $all_plugins ),
		'themes_count'  => count( $all_themes ),
		'admin_email'   => get_option( 'admin_email' ),
	);
}

/* ================================================================
   SETTINGS PAGE — UI simple estilo WP Umbrella
   ================================================================ */

function lumina_agent_settings_page() {
	$api_key      = get_option( LUMINA_AGENT_OPT . 'api_key', '' );
	$is_connected = get_option( LUMINA_AGENT_OPT . 'connected', false );
	$site_token   = get_option( LUMINA_AGENT_OPT . 'site_token', '' );
	$project_id   = get_option( LUMINA_AGENT_OPT . 'project_id', '' );
	$connected_at = get_option( LUMINA_AGENT_OPT . 'connected_at', '' );

	?>
	<div class="wrap">
		<h1 style="display:flex;align-items:center;gap:10px;">
			<span style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:8px;">
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v6m0 6v6m8.66-14.5-5.2 3m-6.92 4-5.2 3m14.12 0-5.2-3m-6.92-4-5.2-3"/></svg>
			</span>
			Lumina Agent
			<span style="font-size:11px;color:#94a3b8;font-weight:normal;">v<?php echo LUMINA_AGENT_VERSION; ?></span>
		</h1>

		<?php settings_errors( 'lumina_agent_settings' ); ?>

		<!-- Status Banner -->
		<?php if ( $is_connected && $api_key ): ?>
			<div style="background:linear-gradient(135deg,#ecfdf5,#f0fdf4);border:1px solid #86efac;border-radius:12px;padding:20px;margin:20px 0;display:flex;align-items:center;gap:15px;">
				<span style="display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;background:#22c55e;border-radius:50%;">
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
				</span>
				<div>
					<strong style="color:#166534;font-size:15px;">Conectado a Lumina</strong>
					<p style="margin:4px 0 0;color:#15803d;font-size:13px;">
						Tu sitio está siendo monitoreado.
						<?php if ( $connected_at ): ?>
							Conectado desde: <?php echo esc_html( $connected_at ); ?>
						<?php endif; ?>
					</p>
				</div>
			</div>
		<?php else: ?>
			<div style="background:linear-gradient(135deg,#fefce8,#fef9c3);border:1px solid #fde047;border-radius:12px;padding:20px;margin:20px 0;display:flex;align-items:center;gap:15px;">
				<span style="display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;background:#eab308;border-radius:50%;">
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
				</span>
				<div>
					<strong style="color:#854d0e;font-size:15px;">No conectado</strong>
					<p style="margin:4px 0 0;color:#a16207;font-size:13px;">
						Ingresa tu API Key para conectar este sitio con Lumina.
						<a href="https://lumina.app" target="_blank" style="color:#7c3aed;">Inicia sesión en tu cuenta</a> para obtener tu API Key.
					</p>
				</div>
			</div>
		<?php endif; ?>

		<!-- API Key Form -->
		<div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:30px;max-width:600px;">
			<h2 style="margin-top:0;font-size:16px;color:#1e293b;">Tu API Key</h2>
			<p style="color:#64748b;font-size:13px;margin-bottom:20px;">
				Copia tu API Key desde tu panel de Lumina y pégala aquí.
				<br>Tu API Key se puede usar en múltiples sitios.
			</p>

			<form method="post" action="options.php">
				<?php settings_fields( 'lumina_agent_settings' ); ?>

				<div style="margin-bottom:20px;">
					<input
						type="text"
						name="<?php echo LUMINA_AGENT_OPT; ?>api_key"
						value="<?php echo esc_attr( $api_key ); ?>"
						class="regular-text"
						placeholder="lmn_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
						style="width:100%;max-width:500px;padding:10px 14px;font-size:14px;font-family:monospace;border:2px solid #e2e8f0;border-radius:8px;transition:border-color 0.2s;"
						onfocus="this.style.borderColor='#6366f1'"
						onblur="this.style.borderColor='#e2e8f0'"
					/>
				</div>

				<button type="submit" class="button button-primary" style="background:linear-gradient(135deg,#6366f1,#7c3aed);border:none;padding:10px 24px;border-radius:8px;font-size:14px;cursor:pointer;">
					Guardar
				</button>
			</form>
		</div>

		<?php if ( $is_connected && $api_key ): ?>
		<!-- Connection Details (collapsible) -->
		<details style="margin-top:20px;max-width:600px;">
			<summary style="cursor:pointer;color:#6366f1;font-size:13px;font-weight:500;">Detalles de conexión</summary>
			<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:15px;margin-top:10px;">
				<table style="width:100%;font-size:13px;">
					<tr>
						<td style="padding:6px 0;color:#64748b;width:140px;">API Key</td>
						<td style="padding:6px 0;"><code style="background:#e2e8f0;padding:2px 6px;border-radius:4px;"><?php echo esc_html( substr( $api_key, 0, 12 ) . '••••••••' ); ?></code></td>
					</tr>
					<tr>
						<td style="padding:6px 0;color:#64748b;">Project ID</td>
						<td style="padding:6px 0;"><code style="background:#e2e8f0;padding:2px 6px;border-radius:4px;font-size:11px;"><?php echo esc_html( $project_id ?: '—' ); ?></code></td>
					</tr>
					<tr>
						<td style="padding:6px 0;color:#64748b;">Site Token</td>
						<td style="padding:6px 0;"><code style="background:#e2e8f0;padding:2px 6px;border-radius:4px;font-size:11px;"><?php echo esc_html( $site_token ? substr( $site_token, 0, 8 ) . '••••' : '—' ); ?></code></td>
					</tr>
					<tr>
						<td style="padding:6px 0;color:#64748b;">Agent Version</td>
						<td style="padding:6px 0;"><?php echo LUMINA_AGENT_VERSION; ?></td>
					</tr>
					<tr>
						<td style="padding:6px 0;color:#64748b;">WordPress</td>
						<td style="padding:6px 0;"><?php echo get_bloginfo( 'version' ); ?></td>
					</tr>
					<tr>
						<td style="padding:6px 0;color:#64748b;">PHP</td>
						<td style="padding:6px 0;"><?php echo phpversion(); ?></td>
					</tr>
				</table>
			</div>
		</details>
		<?php endif; ?>
	</div>
	<?php
}

/* ================================================================
   REST API — Autenticación via X-Lumina-Token header
   ================================================================ */

add_action( 'rest_api_init', 'lumina_agent_register_routes' );

function lumina_agent_register_routes() {

	register_rest_route( 'lumina/v1', '/status', array(
		'methods'             => 'GET',
		'callback'            => 'lumina_agent_status_callback',
		'permission_callback' => 'lumina_agent_verify_token',
	) );

	register_rest_route( 'lumina/v1', '/plugins', array(
		'methods'             => 'GET',
		'callback'            => 'lumina_agent_plugins_callback',
		'permission_callback' => 'lumina_agent_verify_token',
	) );

	register_rest_route( 'lumina/v1', '/themes', array(
		'methods'             => 'GET',
		'callback'            => 'lumina_agent_themes_callback',
		'permission_callback' => 'lumina_agent_verify_token',
	) );

	register_rest_route( 'lumina/v1', '/update-plugin', array(
		'methods'             => 'POST',
		'callback'            => 'lumina_agent_update_plugin_callback',
		'permission_callback' => 'lumina_agent_verify_token',
		'args' => array(
			'plugin' => array(
				'required'          => true,
				'type'              => 'string',
				'sanitize_callback' => 'sanitize_text_field',
			),
		),
	) );

	register_rest_route( 'lumina/v1', '/update-theme', array(
		'methods'             => 'POST',
		'callback'            => 'lumina_agent_update_theme_callback',
		'permission_callback' => 'lumina_agent_verify_token',
		'args' => array(
			'theme' => array(
				'required'          => true,
				'type'              => 'string',
				'sanitize_callback' => 'sanitize_text_field',
			),
		),
	) );

	register_rest_route( 'lumina/v1', '/update-core', array(
		'methods'             => 'POST',
		'callback'            => 'lumina_agent_update_core_callback',
		'permission_callback' => 'lumina_agent_verify_token',
	) );

	// Heartbeat — Lumina puede hacer ping para verificar que el agent sigue activo
	register_rest_route( 'lumina/v1', '/heartbeat', array(
		'methods'             => 'GET',
		'callback'            => function() {
			return new WP_REST_Response( array(
				'alive'         => true,
				'agent_version' => LUMINA_AGENT_VERSION,
				'timestamp'     => current_time( 'c' ),
			), 200 );
		},
		'permission_callback' => 'lumina_agent_verify_token',
	) );
}

/**
 * Verifica el header X-Lumina-Token contra el site_token almacenado.
 * Este es el ÚNICO mecanismo de auth — no se necesitan Application Passwords.
 */
function lumina_agent_verify_token( WP_REST_Request $request ) {
	$token = $request->get_header( 'X-Lumina-Token' );

	if ( empty( $token ) ) {
		return new WP_Error( 'missing_token', 'Header X-Lumina-Token requerido.', array( 'status' => 401 ) );
	}

	$stored_token = get_option( LUMINA_AGENT_OPT . 'site_token', '' );

	if ( empty( $stored_token ) || ! hash_equals( $stored_token, $token ) ) {
		return new WP_Error( 'invalid_token', 'Token inválido.', array( 'status' => 403 ) );
	}

	return true;
}

/* ================================================================
   GET /lumina/v1/status
   ================================================================ */

function lumina_agent_status_callback() {
	global $wp_version;

	require_once ABSPATH . 'wp-admin/includes/plugin.php';
	require_once ABSPATH . 'wp-admin/includes/update.php';

	$woo_active  = class_exists( 'WooCommerce' );
	$woo_version = $woo_active && defined( 'WC_VERSION' ) ? WC_VERSION : null;

	$all_plugins    = get_plugins();
	$active_plugins = get_option( 'active_plugins', array() );

	$update_plugins = get_site_transient( 'update_plugins' );
	$update_themes  = get_site_transient( 'update_themes' );

	$plugins_with_updates = ! empty( $update_plugins->response ) ? count( $update_plugins->response ) : 0;
	$themes_with_updates  = ! empty( $update_themes->response ) ? count( $update_themes->response ) : 0;

	$core_updates      = get_core_updates();
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
		'success'          => true,
		'agent_version'    => LUMINA_AGENT_VERSION,
		'site_url'         => home_url(),
		'admin_url'        => admin_url(),
		'wp_version'       => $wp_version,
		'wp_latest'        => $core_latest,
		'core_update'      => $core_update_avail,
		'php_version'      => phpversion(),
		'mysql_version'    => $GLOBALS['wpdb']->db_version(),
		'multisite'        => is_multisite(),
		'woocommerce'      => $woo_active,
		'woo_version'      => $woo_version,
		'locale'           => get_locale(),
		'timezone'         => wp_timezone_string(),
		'memory_limit'     => WP_MEMORY_LIMIT,
		'debug_mode'       => WP_DEBUG,
		'ssl'              => is_ssl(),
		'plugins_total'    => count( $all_plugins ),
		'plugins_active'   => count( $active_plugins ),
		'plugins_updates'  => $plugins_with_updates,
		'themes_updates'   => $themes_with_updates,
	), 200 );
}

/* ================================================================
   GET /lumina/v1/plugins
   ================================================================ */

function lumina_agent_plugins_callback() {
	require_once ABSPATH . 'wp-admin/includes/plugin.php';
	require_once ABSPATH . 'wp-admin/includes/update.php';

	wp_update_plugins();
	$update_plugins = get_site_transient( 'update_plugins' );
	$all_plugins    = get_plugins();
	$active_plugins = get_option( 'active_plugins', array() );
	$auto_updates   = get_option( 'auto_update_plugins', array() );

	$result = array();
	foreach ( $all_plugins as $file => $data ) {
		$slug = dirname( $file );
		if ( $slug === '.' ) $slug = basename( $file, '.php' );

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
		);
	}

	return new WP_REST_Response( array( 'success' => true, 'count' => count( $result ), 'plugins' => $result ), 200 );
}

/* ================================================================
   GET /lumina/v1/themes
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

	return new WP_REST_Response( array( 'success' => true, 'count' => count( $result ), 'themes' => $result ), 200 );
}

/* ================================================================
   POST /lumina/v1/update-plugin
   ================================================================ */

function lumina_agent_update_plugin_callback( WP_REST_Request $request ) {
	$plugin_file = $request->get_param( 'plugin' );

	if ( ! file_exists( WP_PLUGIN_DIR . '/' . $plugin_file ) ) {
		if ( ! str_ends_with( $plugin_file, '.php' ) && file_exists( WP_PLUGIN_DIR . '/' . $plugin_file . '.php' ) ) {
			$plugin_file .= '.php';
		} else {
			return new WP_REST_Response( array( 'success' => false, 'error' => 'Plugin not found: ' . $plugin_file ), 404 );
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
		return new WP_REST_Response( array( 'success' => false, 'error' => 'No update available.', 'plugin' => $plugin_file ), 200 );
	}

	$new_version = $update_plugins->response[ $plugin_file ]->new_version ?? 'unknown';
	$skin     = new Automatic_Upgrader_Skin();
	$upgrader = new Plugin_Upgrader( $skin );
	$result   = $upgrader->upgrade( $plugin_file );

	if ( is_wp_error( $result ) ) {
		return new WP_REST_Response( array( 'success' => false, 'error' => $result->get_error_message(), 'plugin' => $plugin_file ), 500 );
	}
	if ( $result === false ) {
		return new WP_REST_Response( array( 'success' => false, 'error' => 'Upgrade failed. ' . implode( ' ', $skin->get_upgrade_messages() ), 'plugin' => $plugin_file ), 500 );
	}

	$activate_result = activate_plugin( $plugin_file );
	$plugin_data     = get_plugin_data( WP_PLUGIN_DIR . '/' . $plugin_file );

	return new WP_REST_Response( array(
		'success'     => true,
		'plugin'      => $plugin_file,
		'old_version' => $new_version,
		'new_version' => $plugin_data['Version'] ?? $new_version,
		'name'        => $plugin_data['Name'] ?? '',
		'activated'   => ! is_wp_error( $activate_result ),
	), 200 );
}

/* ================================================================
   POST /lumina/v1/update-theme
   ================================================================ */

function lumina_agent_update_theme_callback( WP_REST_Request $request ) {
	$theme_slug = $request->get_param( 'theme' );

	$theme = wp_get_theme( $theme_slug );
	if ( ! $theme->exists() ) {
		return new WP_REST_Response( array( 'success' => false, 'error' => 'Theme not found: ' . $theme_slug ), 404 );
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
		return new WP_REST_Response( array( 'success' => false, 'error' => 'No update available.', 'theme' => $theme_slug ), 200 );
	}

	$skin     = new Automatic_Upgrader_Skin();
	$upgrader = new Theme_Upgrader( $skin );
	$result   = $upgrader->upgrade( $theme_slug );

	if ( is_wp_error( $result ) ) {
		return new WP_REST_Response( array( 'success' => false, 'error' => $result->get_error_message(), 'theme' => $theme_slug ), 500 );
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
   POST /lumina/v1/update-core
   ================================================================ */

function lumina_agent_update_core_callback( WP_REST_Request $request ) {
	require_once ABSPATH . 'wp-admin/includes/class-wp-upgrader.php';
	require_once ABSPATH . 'wp-admin/includes/file.php';
	require_once ABSPATH . 'wp-admin/includes/misc.php';
	require_once ABSPATH . 'wp-admin/includes/update.php';

	wp_version_check();
	$updates = get_core_updates();

	if ( empty( $updates ) || ! is_array( $updates ) || $updates[0]->response === 'latest' ) {
		return new WP_REST_Response( array( 'success' => false, 'error' => 'WordPress is already up to date.' ), 200 );
	}

	$update   = $updates[0];
	$skin     = new Automatic_Upgrader_Skin();
	$upgrader = new Core_Upgrader( $skin );
	$result   = $upgrader->upgrade( $update );

	if ( is_wp_error( $result ) ) {
		return new WP_REST_Response( array( 'success' => false, 'error' => $result->get_error_message() ), 500 );
	}

	global $wp_version;
	return new WP_REST_Response( array( 'success' => true, 'new_version' => $result ?? $wp_version ), 200 );
}

/* ================================================================
   ADMIN BAR — Indicador visual de estado
   ================================================================ */

add_action( 'admin_bar_menu', 'lumina_agent_admin_bar', 100 );

function lumina_agent_admin_bar( $wp_admin_bar ) {
	if ( ! current_user_can( 'manage_options' ) ) return;

	$connected = get_option( LUMINA_AGENT_OPT . 'connected', false );

	$wp_admin_bar->add_node( array(
		'id'    => 'lumina-agent',
		'title' => '<span style="display:inline-flex;align-items:center;gap:6px;">'
			. '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' . ( $connected ? '#22c55e' : '#eab308' ) . ';"></span>'
			. 'Lumina</span>',
		'href'  => admin_url( 'options-general.php?page=lumina-agent' ),
	) );
}
